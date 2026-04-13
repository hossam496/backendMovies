import mongoose from "mongoose"
import Movie from "../models/movieModel.js"
import path from "path"
import fs from "fs"
import cloudinary from "../config/cloudinary.js"

const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://backend-movies-ruby.vercel.app' 
  : 'http://localhost:5000';

// Extracts the filename from a URL or upload path
const extractFilenameFromUrl = (u) => {
    if (!u || typeof u !== "string") return null;
    const parts = u.split("/uploads/");
    if (parts.length > 1) return parts.pop();
    if (u.startsWith("uploads/")) return u.replace(/^uploads\//, "");
    return /^[^\/]+\.[a-zA-Z0-9]+$/.test(u) || /^[^\/]+(\?.*)?$/.test(u) ? u : null;
};

// Builds a full upload URL from a filename or returns null if invalid
// Also rewrites incorrectly saved localhost URLs to the correct API_BASE
const getUploadUrl = (val) => {
    if (!val) return null;
    
    // If it's an external URL not from our uploads folder, return it verbatim
    if (typeof val === "string" && /^(https?:\/\/)/.test(val) && !val.includes('/uploads/')) {
        return val;
    }
    
    const cleaned = extractFilenameFromUrl(val);
    if (!cleaned) return null;
    return `${API_BASE}/uploads/${cleaned}`;
};

// Deletes a file from the uploads folder or from Cloudinary if it exists
const tryUnlinkUploadUrl = async (urlOrFilename) => {
    if (!urlOrFilename) return;
    
    // Check if it's a Cloudinary URL
    if (typeof urlOrFilename === 'string' && urlOrFilename.includes('res.cloudinary.com')) {
        try {
            // Extract public_id from Cloudinary URL (e.g. ".../upload/v1234/movie-booking/filename.ext")
            const urlParts = urlOrFilename.split('/upload/');
            if (urlParts.length > 1) {
                let pathAfterUpload = urlParts.pop();
                // remove version tag if exists (v1234/)
                pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '');
                // remove extension
                const publicId = pathAfterUpload.replace(/\.[^/.]+$/, "");
                
                await cloudinary.uploader.destroy(publicId);
                console.log(`🗑️ Cloudinary file deleted: ${publicId}`);
            }
        } catch (err) {
            console.warn("⚠️ Failed to delete Cloudinary file", urlOrFilename, err?.message);
        }
        return;
    }

    const fn = extractFilenameFromUrl(urlOrFilename)
    if (!fn) return
    const filepath = path.join(process.cwd(), "uploads", fn)
    if (fs.existsSync(filepath)) {
        fs.unlink(filepath, (err) => {
            if (err)
                console.warn("⚠️ Failed to unlink local file", filepath, err?.message || err)
        })
    }
}

// Safely parses JSON and returns null on failure
const safeParseJSON = (v) => {
    if (!v) return null
    if (typeof v === "object") return v
    try {
        return JSON.parse(v)
    } catch {
        return null
    }
}

// Normalizes a person file value to a simple filename
const normalizeLatestPersonFilename = (value) => {
    if (!value) return null
    if (typeof value === "string") {
        const fn = extractFilenameFromUrl(value)
        return fn || value
    }
    if (typeof value === "object") {
        const candidate =
            value.filename ||
            value.path ||
            value.url ||
            value.file ||
            value.image ||
            value.preview ||
            null
        return candidate ? normalizeLatestPersonFilename(candidate) : null
    }
    return null
}

// Converts a person object into a {name, role, preview} format
const personToPreview = (p) => {
    if (!p) return { name: "", role: "", preview: null }
    const candidate = p.preview || p.file || p.image || p.url || null
    return {
        name: p.name || "",
        role: p.role || "",
        preview: candidate ? getUploadUrl(candidate) : null,
    }
}

/* ---------------------- shared transformers ---------------------- */
const buildLatestTrailerPeople = (arr = []) =>
    (arr || []).map((p) => ({
        name: (p && p.name) || "",
        role: (p && p.role) || "",
        file: normalizeLatestPersonFilename(
            p && (p.file || p.preview || p.url || p.image)
        ),
    }))

const enrichLatestTrailerForOutput = (lt = {}) => {
    const copy = { ...lt }
    copy.thumbnail = copy.thumbnail
        ? getUploadUrl(copy.thumbnail)
        : copy.thumbnail || null
    const mapPerson = (p) => {
        const c = { ...(p || {}) }
        c.preview = c.file
            ? getUploadUrl(c.file)
            : c.preview
            ? getUploadUrl(c.preview)
            : null
        c.name = c.name || ""
        c.role = c.role || ""
        return c
    }
    copy.directors = Array.isArray(copy.directors) ? copy.directors.map(mapPerson) : []
    copy.producers = Array.isArray(copy.producers) ? copy.producers.map(mapPerson) : []
    copy.singers = Array.isArray(copy.singers) ? copy.singers.map(mapPerson) : []
    return copy
}


const normalizeItemForOutput = (it = {}) => {
    const obj = { ...it }
    obj.thumbnail = it.latestTrailer?.thumbnail
        ? getUploadUrl(it.latestTrailer.thumbnail)
        : it.poster
        ? getUploadUrl(it.poster)
        : null
    obj.trailerUrl =
        it.trailerUrl || it.latestTrailer?.url || it.latestTrailer?.videoId || null

    if (it.type === "latestTrailer" && it.latestTrailer) {
        const lt = it.latestTrailer
        obj.genres = obj.genres || lt.genres || []
        obj.year = obj.year || lt.year || null
        obj.rating = obj.rating || lt.rating || null
        obj.duration = obj.duration || lt.duration || null
        obj.description = obj.description || lt.description || lt.excerpt || ""
    }

    obj.cast = Array.isArray(it.cast) ? it.cast.map(personToPreview) : []
    obj.directors = Array.isArray(it.directors) ? it.directors.map(personToPreview) : []
    obj.producers = Array.isArray(it.producers) ? it.producers.map(personToPreview) : []


    if (it.latestTrailer)
        obj.latestTrailer = enrichLatestTrailerForOutput(it.latestTrailer)

    // NEW: include auditorium in normalized output (keep null if not present)
    obj.auditorium = it.auditorium || null

    return obj
}

// ✅ CREATE A MOVIE - مع تصحيح وتحسين
export async function createMovie(req, res) {
    try {
        console.log("📥 ========== CREATE MOVIE REQUEST ==========")
        console.log("📝 Request body:", req.body)
        console.log("📁 Uploaded files:", req.files ? Object.keys(req.files) : "None")
        
        const body = req.body || {}

        // ✅ معالجة الملفات المرفوعة
        const posterUrl = req.files?.poster?.[0]?.path
            ? req.files.poster[0].path
            : body.poster || null

        const trailerUrl = req.files?.trailerFile?.[0]?.path
            ? req.files.trailerFile[0].path
            : body.trailerUrl || null

        const videoUrl = req.files?.videoUrl?.[0]?.path
            ? req.files.videoUrl[0].path
            : body.videoUrl || null

        console.log("🖼️ Poster URL:", posterUrl)
        console.log("🎬 Trailer URL:", trailerUrl)
        console.log("🎥 Video URL:", videoUrl)

        // ✅ معالجة الكاتيجوريز
        let categories = []
        if (body.categories) {
            try {
                if (typeof body.categories === 'string' && body.categories.startsWith('[')) {
                    categories = JSON.parse(body.categories)
                } else {
                    categories = String(body.categories)
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                }
            } catch (e) {
                categories = []
            }
        }

        // ✅ معالجة البيانات الأخرى
        const slots = safeParseJSON(body.slots) || []
        const seatPrices = safeParseJSON(body.seatPrices) || {
            standard: Number(body.standard || 0),
            recliner: Number(body.recliner || 0),
        }

        const cast = safeParseJSON(body.cast) || []
        const directors = safeParseJSON(body.directors) || []
        const producers = safeParseJSON(body.producers) || []

        console.log("🎭 Cast:", cast.length, "items")
        console.log("🎬 Directors:", directors.length, "items")
        console.log("💰 Producers:", producers.length, "items")

        // ✅ ربط الملفات بالشخصيات
        const attachFiles = (
            filesArrName,
            targetArr,
            toFilename = (f) => f
        ) => {
            if (!req.files?.[filesArrName]) return
            req.files[filesArrName].forEach((file, idx) => {
                if (targetArr[idx]) {
                    targetArr[idx].file = file.path
                } else {
                    targetArr[idx] = { name: "", file: file.path }
                }
            })
        }

        attachFiles("castFiles", cast)
        attachFiles("directorFiles", directors)
        attachFiles("producerFiles", producers)

        // ✅ latest trailer processing
        const latestTrailerBody = safeParseJSON(body.latestTrailer) || {}
        
        if (req.files?.ltThumbnail?.[0]?.path) {
            latestTrailerBody.thumbnail = req.files.ltThumbnail[0].path
        } else if (body.ltThumbnail) {
            const fn = extractFilenameFromUrl(body.ltThumbnail)
            latestTrailerBody.thumbnail = fn ? fn : body.ltThumbnail
        }

        if (body.ltVideoUrl) latestTrailerBody.videoId = body.ltVideoUrl
        if (body.ltUrl) latestTrailerBody.url = body.ltUrl
        if (body.ltTitle) latestTrailerBody.title = body.ltTitle

        latestTrailerBody.directors = latestTrailerBody.directors || []
        latestTrailerBody.producers = latestTrailerBody.producers || []
        latestTrailerBody.singers = latestTrailerBody.singers || []

        const attachLtFiles = (fieldName, arrName) => {
            if (!req.files?.[fieldName]) return
            req.files[fieldName].forEach((file, idx) => {
                const filepath = file.path
                if (latestTrailerBody[arrName][idx]) {
                    latestTrailerBody[arrName][idx].file = filepath
                } else {
                    latestTrailerBody[arrName][idx] = { name: "", file: filepath }
                }
            })
        }

        attachLtFiles("ltDirectorFiles", "directors")
        attachLtFiles("ltProducerFiles", "producers")
        attachLtFiles("ltSingerFiles", "singers")

        latestTrailerBody.directors = buildLatestTrailerPeople(
            latestTrailerBody.directors
        )
        latestTrailerBody.producers = buildLatestTrailerPeople(
            latestTrailerBody.producers
        )
        latestTrailerBody.singers = buildLatestTrailerPeople(
            latestTrailerBody.singers
        )

        // ✅ معالجة القاعة
        const auditoriumValue =
            typeof body.auditorium === "string" && body.auditorium.trim()
                ? String(body.auditorium).trim()
                : "Audi 1"

        // ✅ إنشاء وثيقة الفيلم
        const movieData = {
            _id: new mongoose.Types.ObjectId(),
            type: body.type || "normal",
            movieName: body.movieName || body.title || "",
            categories,
            poster: posterUrl,
            trailerUrl,
            videoUrl,
            rating: Number(body.rating) || 0,
            duration: Number(body.duration) || 0,
            slots,
            seatPrices,
            cast,
            directors,
            producers,
            story: body.story || "",
            latestTrailer: Object.keys(latestTrailerBody).length > 0 ? latestTrailerBody : undefined,
            auditorium: auditoriumValue,
        }

        console.log("💾 Movie data to save:", JSON.stringify(movieData, null, 2))

        // ✅ حفظ في قاعدة البيانات
        const doc = new Movie(movieData)
        const saved = await doc.save()
        
        console.log("✅ Movie saved successfully! ID:", saved._id)

        return res.status(201).json({
            success: true,
            message: "Movie created successfully.",
            data: saved,
        })
    } catch (err) {
        console.error("❌ CreateMovie Error:", err)
        console.error("❌ Error stack:", err.stack)
        return res.status(500).json({
            success: false,
            message: "Server error: " + err.message,
            error: process.env.NODE_ENV === 'development' ? err.stack : undefined
        })
    }
}

// ✅ GETMOVIE (ALL)
export async function getMovies(req, res) {
    try {
        console.log("📥 GET MOVIES request query:", req.query)
        
        const {
            category,
            type,
            sort = "-createdAt",
            page = 1,
            limit = 520,
            search,
            latestTrailers,
        } = req.query
        
        let filter = {}
        
        if (typeof category === "string" && category.trim())
            filter.categories = { $in: [category.trim()] }
        
        if (typeof type === "string" && type.trim()) 
            filter.type = type.trim()
        
        if (typeof search === "string" && search.trim()) {
            const q = search.trim()
            filter.$or = [
                { movieName: { $regex: q, $options: "i" } },
                { "latestTrailer.title": { $regex: q, $options: "i" } },
                { story: { $regex: q, $options: "i" } },
            ]
        }
        
        if (latestTrailers && String(latestTrailers).toLowerCase() !== "false") {
            filter = Object.keys(filter).length === 0
                ? { type: "latestTrailer" }
                : { $and: [filter, { type: "latestTrailer" }] }
        }

        const pg = Math.max(1, parseInt(page, 10) || 1)
        const lim = Math.min(200, parseInt(limit, 10) || 12)
        const skip = (pg - 1) * lim

        console.log("🔍 Filter:", filter)
        console.log("📄 Pagination: page", pg, "limit", lim)

        const total = await Movie.countDocuments(filter)
        const items = await Movie.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(lim)
            .lean()

        console.log("✅ Found", items.length, "movies out of", total)

        const normalized = (items || []).map(normalizeItemForOutput)
        
        return res.json({
            success: true,
            total,
            page: pg,
            limit: lim,
            items: normalized,
        })
    } catch (err) {
        console.error("❌ GetMovie Error:", err)
        return res.status(500).json({
            success: false,
            message: "Server Error: " + err.message,
        })
    }
}

// ✅ GET A MOVIE USING ID
export async function getMovieById(req, res) {
    try {
        const { id } = req.params
        console.log("📥 GET MOVIE BY ID:", id)
        
        if (!id)
            return res.status(400).json({
                success: false,
                message: "ID is required",
            })

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({
                success: false,
                message: "Invalid ID format",
            })

        const item = await Movie.findById(id).lean()
        
        if (!item)
            return res.status(404).json({
                success: false,
                message: "Movie not found",
            })

        const obj = normalizeItemForOutput(item)

        if (item.type === "latestTrailer" && item.latestTrailer) {
            const lt = item.latestTrailer
            obj.genres = obj.genres || lt.genres || []
            obj.year = obj.year || lt.year || null
            obj.rating = obj.rating || lt.rating || null
            obj.duration = obj.duration || lt.duration || null
            obj.description =
                obj.description ||
                lt.description ||
                lt.excerpt ||
                obj.description ||
                ""
        }
        
        console.log("✅ Movie found:", obj.movieName)
        
        return res.json({ success: true, item: obj })
    } catch (err) {
        console.error("❌ GetMovieById Error:", err)
        return res.status(500).json({
            success: false,
            message: "Server Error: " + err.message,
        })
    }
}

// ✅ DELETE A MOVIE AND UNLINK THE IMG
export async function deleteMovie(req, res) {
    try {
        const { id } = req.params
        console.log("🗑️ DELETE MOVIE:", id)
        
        if (!id)
            return res.status(400).json({
                success: false,
                message: "ID is required",
            })

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({
                success: false,
                message: "Invalid ID format",
            })

        const m = await Movie.findById(id)
        
        if (!m)
            return res.status(404).json({
                success: false,
                message: "Movie not found",
            })

        console.log("🎬 Deleting movie:", m.movieName)

        // ✅ حذف الملفات من السيرفر
        if (m.poster) {
            console.log("🗑️ Deleting poster:", m.poster)
            tryUnlinkUploadUrl(m.poster)
        }
        
        if (m.latestTrailer && m.latestTrailer.thumbnail) {
            console.log("🗑️ Deleting thumbnail:", m.latestTrailer.thumbnail)
            tryUnlinkUploadUrl(m.latestTrailer.thumbnail)
        }

        // ✅ حذف ملفات الأشخاص
        ;[(m.cast || []), (m.directors || []), (m.producers || [])].forEach((arr, idx) => {
            const type = ["cast", "directors", "producers"][idx]
            arr.forEach((p, i) => {
                if (p && p.file) {
                    console.log(`🗑️ Deleting ${type} file ${i + 1}:`, p.file)
                    tryUnlinkUploadUrl(p.file)
                }
            })
        })

        if (m.latestTrailer) {
            ;[
                ...(m.latestTrailer.directors || []),
                ...(m.latestTrailer.producers || []),
                ...(m.latestTrailer.singers || []),
            ].forEach((p, idx) => {
                if (p && p.file) {
                    console.log(`🗑️ Deleting latest trailer person file ${idx + 1}:`, p.file)
                    tryUnlinkUploadUrl(p.file)
                }
            })
        }

        // ✅ حذف من قاعدة البيانات
        await Movie.findByIdAndDelete(id)
        
        console.log("✅ Movie deleted successfully")

        return res.json({
            success: true,
            message: "Movie deleted successfully.",
        })
    } catch (err) {
        console.error("❌ DeleteMovie error:", err)
        return res.status(500).json({
            success: false,
            message: "Server Error: " + err.message,
        })
    }
}

export async function updateMovie(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        const m = await Movie.findById(id);
        if (!m) return res.status(404).json({ success: false, message: "Movie not found" });

        const body = req.body || {};
        
        // Handle categories
        let categories = m.categories;
        if (body.categories) {
            try {
                if (typeof body.categories === 'string' && body.categories.startsWith('[')) {
                    categories = JSON.parse(body.categories);
                } else {
                    categories = String(body.categories).split(",").map(s => s.trim()).filter(Boolean);
                }
            } catch (e) {}
        }

        // Handle file updates (Unlink old if new provided)
        const posterUrl = req.files?.poster?.[0]?.path
            ? (tryUnlinkUploadUrl(m.poster), req.files.poster[0].path)
            : body.poster || m.poster;

        const trailerUrl = req.files?.trailerFile?.[0]?.path
            ? (tryUnlinkUploadUrl(m.trailerUrl), req.files.trailerFile[0].path)
            : body.trailerUrl || m.trailerUrl;

        const videoUrl = req.files?.videoUrl?.[0]?.path
            ? (tryUnlinkUploadUrl(m.videoUrl), req.files.videoUrl[0].path)
            : body.videoUrl || m.videoUrl;

        const slots = body.slots ? (safeParseJSON(body.slots) || m.slots) : m.slots;
        const seatPrices = body.seatPrices ? (safeParseJSON(body.seatPrices) || m.seatPrices) : m.seatPrices;
        const cast = body.cast ? (safeParseJSON(body.cast) || m.cast) : m.cast;
        const directors = body.directors ? (safeParseJSON(body.directors) || m.directors) : m.directors;
        const producers = body.producers ? (safeParseJSON(body.producers) || m.producers) : m.producers;

        // Update movie data
        const updateData = {
            movieName: body.movieName || body.title || m.movieName,
            type: body.type || m.type,
            categories,
            poster: posterUrl,
            trailerUrl,
            videoUrl,
            rating: body.rating !== undefined ? Number(body.rating) : m.rating,
            duration: body.duration !== undefined ? Number(body.duration) : m.duration,
            slots,
            seatPrices,
            cast,
            directors,
            producers,
            story: body.story !== undefined ? body.story : m.story,
            auditorium: body.auditorium || m.auditorium,
        };

        const updated = await Movie.findByIdAndUpdate(id, updateData, { new: true });
        return res.status(200).json({ success: true, message: "Movie updated successfully", data: updated });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error: " + err.message });
    }
}

export default {
    createMovie,
    getMovies,
    getMovieById,
    deleteMovie,
    updateMovie,
}