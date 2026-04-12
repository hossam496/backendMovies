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

// CORS — allow production frontend and local dev dynamically
const corsOptions = {
    origin: function(origin, callback) {
        callback(null, true);
    },
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
