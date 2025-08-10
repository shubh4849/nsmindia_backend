const {authService, favouriteService, userService} = require('../services');
const catchAsync = require('../utils/catchAsync');

const createNewUserObject = newUser => ({
  email: newUser.email,
  firebaseUid: newUser.uid,
  profilePic: newUser.picture,
  isEmailVerified: newUser.isEmailVerified,
  firebaseSignInProvider: newUser.firebase.sign_in_provider,
});

const loginUser = catchAsync(async (req, res) => {
  const user = req.user.__t === 'Student' ? await userService.getStudent(req.user._id) : req.user;
  res.status(200).send({status: true, data: req.user});
});

const registerUser = catchAsync(async (req, res) => {
  if (req.user) {
    res.status(401).send({status: false, message: 'User already exist'});
  } else {
    const userObj = {
      ...createNewUserObject(req.newUser),
      ...req.body,
    };
    let user = null;
    switch (req.routeType) {
      case 'Client':
        const favourites = await favouriteService.createFavourite();
        user = await authService.createStudent({...userObj, favourites}, req.file);
        break;
      case 'Admin':
        user = await authService.createAdmin(userObj);
        break;
      default:
        break;
    }
    res.status(201).send({status: true, data: user});
  }
});

module.exports = {
  loginUser,
  registerUser,
};
