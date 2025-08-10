const {default: mongoose} = require('mongoose');

const paginate = schema => {
  schema.statics.paginate = async function(filters, options, geoFilters = null) {
    const pipeline = [];
    if (geoFilters) {
      const {longitude, latitude, radius = 1} = geoFilters;
      pipeline.push({
        $geoNear: {
          near: {type: 'Point', coordinates: [longitude, latitude]},
          distanceField: 'dist.calculated',
          maxDistance: 1609.34 * radius,
          key: 'location',
        },
      });
    }

    const {postPopulateFilters, ...initialFilters} = filters;

    pipeline.push({$match: initialFilters || {}});

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;

    const skip = (page - 1) * limit;

    let docsPipeline = [...pipeline, ...(options.pipeline || [])];

    if (options.populate) {
      const populateOptions = Array.isArray(options.populate) ? options.populate : [options.populate];

      populateOptions.forEach(populateOption => {
        const matchObj = {};

        const [path, select] = populateOption.split('::');

        const isPathAnArray = this.schema.paths[path].instance === 'Array';

        const collectionName = mongoose.model(this.schema.obj[path].ref).collection.name;
        let isMatchRequested = false;

        const selectFields =
          select === '*'
            ? Object.keys(mongoose.model(this.schema.obj[path].ref).schema.obj)
            : select.split(',').map(ele => {
                const [name, match] = ele.split(':');

                if (match) {
                  matchObj[name] = match;
                  isMatchRequested = true;
                }
                return name;
              });

        const lookup = {
          $lookup: {
            from: collectionName,
            localField: path,
            foreignField: '_id',
            as: path,
            ...(Object.keys(matchObj).length > 0
              ? {
                  pipeline: [
                    {
                      $match: {
                        $or: Object.keys(matchObj).map(key => ({
                          [key]: new RegExp(matchObj[key], 'i'),
                        })),
                      },
                    },
                  ],
                }
              : {}),
          },
        };

        docsPipeline.push(lookup);

        const populateFieldQueryObject = {
          $map: {
            input: `$${path}`,
            as: 'element',
            in: {
              $mergeObjects: [
                ...selectFields.map(field => ({
                  [field]: `$$element.${field}`,
                })),
                {_id: '$$element._id'},
              ],
            },
          },
        };
        docsPipeline.push({
          $replaceRoot: {
            newRoot: {
              $cond: {
                if: {$gte: [{$size: `$${path}`}, 0]},
                then: {
                  $mergeObjects: [
                    '$$ROOT',
                    {
                      [path]: isPathAnArray ? populateFieldQueryObject : {$first: populateFieldQueryObject},
                    },
                  ],
                },
                else: {},
              },
            },
          },
        });
        if (!isPathAnArray) {
          docsPipeline.push({
            $addFields: {
              [path]: {
                $cond: {
                  if: {$eq: [`$${path}`, []]},
                  then: null,
                  else: `$${path}`,
                },
              },
            },
          });
        }

        if (isMatchRequested) {
          docsPipeline.push({
            $match: {
              $expr: {
                $ne: ['$$ROOT', {}],
              },
            },
          });
        }
      });
      if (postPopulateFilters) {
        docsPipeline.push({
          $match: postPopulateFilters,
        });
      }
    }

    if (options.project) {
      docsPipeline.push({$project: {...options.project}});
    }

    const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
    const sortField = options.sortBy ? options.sortBy : 'createdAt';

    const countPipeline = [...docsPipeline];

    docsPipeline.push({$sort: {[sortField]: sortOrder}});
    docsPipeline.push({$skip: skip}, {$limit: limit});

    countPipeline.push({$count: 'totalResults'});

    const countPromise = this.aggregate(countPipeline).exec();

    const docsPromise = this.aggregate(docsPipeline).exec();

    return Promise.all([countPromise, docsPromise]).then(values => {
      const [counts, results] = values;
      const {totalResults = 0} = counts.length > 0 ? counts[0] : {};

      const totalPages = Math.ceil(totalResults / limit);
      const result = {
        page,
        limit,
        results,
        totalPages,
        totalResults,
      };
      return result;
    });
  };
};

module.exports = {paginate};
