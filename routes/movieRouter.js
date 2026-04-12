import express from 'express'
import multer from 'multer'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import cloudinary from '../config/cloudinary.js'
import moviesController from '../controllers/moviesController.js'

const movieRouter = express.Router()

// ✅ إعداد Cloudinary Storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'movie-booking',
        allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'mp4', 'mov', 'avi', 'webm'],
        resource_type: 'auto' // مهم لدعم الفيديوهات بالإضافة للصور
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB

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