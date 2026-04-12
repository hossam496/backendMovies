import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import moviesController from '../controllers/moviesController.js'

const movieRouter = express.Router()

// ✅ تأكد من وجود مجلد uploads
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true })
        console.log('📁 Created uploads directory')
    } catch (err) {
        console.warn('⚠️ Could not create uploads directory (might be read-only on Vercel)', err.message)
    }
}

// ✅ إعداد multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e5)
        const ext = path.extname(file.originalname)
        cb(null, `movie-${unique}${ext}`)
    },
})

// ✅ تصفية أنواع الملفات
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (extname && mimetype) {
        return cb(null, true)
    } else {
        cb(new Error('❌ Only images and videos are allowed'))
    }
}

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter
}).fields([
    { name: 'poster', maxCount: 1 },
    { name: 'trailerUrl', maxCount: 1 },
    { name: 'videoUrl', maxCount: 1 },
    { name: 'ltThumbnail', maxCount: 1 },
    { name: 'castFiles', maxCount: 20 },
    { name: 'directorFiles', maxCount: 20 },
    { name: 'producerFiles', maxCount: 20 },
    { name: 'ltDirectorFiles', maxCount: 20 },
    { name: 'ltProducerFiles', maxCount: 20 },
    { name: 'ltSingerFiles', maxCount: 20 },
])

// ✅ middleware للتحقق من multer
const handleUpload = (req, res, next) => {
    console.log('🎬 Multer middleware running...')
    upload(req, res, function (err) {
        if (err) {
            console.error('❌ Multer error:', err.message)
            return res.status(400).json({
                success: false,
                message: 'File upload failed',
                error: err.message
            })
        }
        console.log('✅ Files uploaded successfully:', Object.keys(req.files || {}))
        next()
    })
}

// استخراج الدوال من الكنترولر
const { createMovie, getMovies, getMovieById, deleteMovie, updateMovie } = moviesController

movieRouter.post('/', handleUpload, createMovie)
movieRouter.get('/', getMovies)
movieRouter.get('/:id', getMovieById)
movieRouter.put('/:id', handleUpload, updateMovie)
movieRouter.delete('/:id', deleteMovie)

export default movieRouter