import express from 'express'
import { login, registerUser } from '../controllers/userContrrollers.js'

const userRouter = express.Router();

userRouter.post('/register', registerUser);
userRouter.post('/login', login);

// Admin Routes
import { getUsers, deleteUser, updateUserRole } from '../controllers/userContrrollers.js';
userRouter.get('/', getUsers);
userRouter.delete('/:id', deleteUser);
userRouter.patch('/role/:id', updateUserRole);

export default userRouter;

