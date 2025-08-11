#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
const config = require('../src/config/config');
const {File} = require('../src/models');
const {resolveExtension, buildPublicViewUrl, mapResourceType} = require('../src/utils/cloudinary');

function needsFix(url) {
  return typeof url === 'string' && /\.undefined(?:$|\?|#)/.test(url);
}

function stripExistingExtension(publicId) {
  if (!publicId) return publicId;
  const lastSlash = publicId.lastIndexOf('/');
  const lastDot = publicId.lastIndexOf('.');
  if (lastDot > -1 && lastDot > lastSlash) {
    return publicId.substring(0, lastDot);
  }
  return publicId;
}

async function run() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('Connected to MongoDB');

  const query = {
    $or: [{publicViewUrl: {$regex: /\.undefined(?:$|\?|#)/}}, {publicViewUrl: {$exists: true, $ne: null, $ne: ''}}],
  };

  // We'll actually scan all with a projection to compute extension reliably
  const cursor = File.find(
    {},
    {
      _id: 1,
      originalName: 1,
      mimeType: 1,
      publicViewUrl: 1,
      publicId: 1,
      resourceType: 1,
      format: 1,
    }
  ).cursor();

  let processed = 0;
  let updated = 0;
  for await (const doc of cursor) {
    const {originalName, mimeType} = doc;
    const extension = resolveExtension({format: doc.format, mimeType, originalName});

    // Determine resourceType if missing
    const resourceType = doc.resourceType || mapResourceType(mimeType);

    // Ensure publicId has no extension (Cloudinary IDs don't have one)
    const publicIdNoExt = stripExistingExtension(doc.publicId || doc.key || '');
    if (!publicIdNoExt) {
      processed += 1;
      continue;
    }

    const correctUrl = buildPublicViewUrl({
      cloudName: config.cloudinary.cloudName,
      resourceType,
      publicId: publicIdNoExt,
      extension,
    });

    if (doc.publicViewUrl !== correctUrl) {
      await File.updateOne({_id: doc._id}, {$set: {publicViewUrl: correctUrl, format: extension || doc.format}});
      updated += 1;
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}... updated ${updated}`);
  }

  console.log(`Done. Processed ${processed}, updated ${updated}.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
