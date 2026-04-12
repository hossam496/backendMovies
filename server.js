import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import path from 'path'
import { connectDB } from './config/db.js';
import userRouter from './routes/userRouter.js';
import movieRouter from './routes/movieRouter.js';
import bookingRouter from './routes/bookingRouter.js';

const app = express();
const port = process.env.PORT || 5000;// MIDDLEWARES
app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// DB
connectDB();

// ROUTES
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
app.use('/api/auth', userRouter);
app.use('/api/movies', movieRouter);
app.use('/api/bookings', bookingRouter)

app.get('/', (req, res) => {
    res.send('API WORKING')
});

app.listen(port, () => {
    console.log(`server started on http://localhost:${port}`)
})

export default app;