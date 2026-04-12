import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import path from 'path'
import { connectDB } from '../config/db.js';
import userRouter from '../routes/userRouter.js';
import movieRouter from '../routes/movieRouter.js';
import bookingRouter from '../routes/bookingRouter.js';

const app = express();
const port = process.env.PORT || 5000;

// MIDDLEWARES - CORS must be first
app.use(cors({
    origin: ['https://booking-movies.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Handle OPTIONS preflight requests explicitly
app.options('*', cors());

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

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`server started on http://localhost:${port}`)
    })
}

export default app;
