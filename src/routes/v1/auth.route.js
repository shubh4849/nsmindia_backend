const express = require('express');
const router = express.Router();

const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');

const {authController} = require('../../controllers');

router.post('/login', authController.loginUser);

router.post('/register', validate(authValidation.register), authController.registerUser);

router.post('/admin-secretSignup', validate(authValidation.register), authController.registerUser);

module.exports = router;
