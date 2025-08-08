const express = require('express');
const router = express.Router();

const validate = require('../../middlewares/validate');
const userValidation = require('../../validations/user.validation');

const {userController} = require('../../controllers');

// for updating userDetails
router.patch('/updateDetails', validate(userValidation.updateDetails), userController.updateUser);

// for updating specific user preferences
router.patch('/updatePreferences', validate(userValidation.updateUserPreferences), userController.updatePreferences);

// for deleting a user
router.delete('/:userId', validate(userValidation.deleteUser), userController.deleteUser);

// to soft delete a user
router.post('/delete/:userId', validate(userValidation.deleteUser), userController.softDeleteUser);

module.exports = router;
