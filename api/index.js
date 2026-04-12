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

// CORS — allow production frontend and local dev
const allowedOrigins = ['https://booking-movies.vercel.app', 'http://localhost:5173'];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman) or matching origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 204
};

// Explicitly handle ALL preflight OPTIONS requests before any other middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

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
