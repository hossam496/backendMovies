import mongoose from "mongoose"

const personSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true, default: "" },
        role: { type: String, trim: true, default: "" }, // used for cast
        file: { type: String, trim: true, default: null }, // for url
    },
    {
        _id: false,
    }
)

const slotSchema = new mongoose.Schema(
    {
        date: { type: String, default: "" },
        time: { type: String, default: "" },
        ampm: { type: String, enum: ["AM", "PM"], default: "AM" },
    },
    {
        _id: false,
    }
)

const latestTrailerSchema = new mongoose.Schema(
    {
        title: { type: String, trim: true },
        genres: [{ type: String }],
        duration: {
            hours: { type: Number, default: 0 },
            minutes: { type: Number, default: 0 },
        },
        year: { type: Number },
        rating: { type: Number, default: 0 },
        description: { type: String, trim: true },
        thumbnail: { type: String, trim: true }, // filename or url
        videoId: { type: String, trim: true }, // storing the url

        directors: [personSchema],
        producers: [personSchema],
        singers: [personSchema],
    },
    {
        _id: false,
    }
)

const movieSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["normal", "featured", "releaseSoon", "latestTrailer", "latestTrailers"],
            default: "normal",
        },

        movieName: { type: String, trim: true, required: true },
        categories: [{ type: String }],
        poster: { type: String, trim: true }, // url or filename
        trailerUrl: { type: String, trim: true },
        videoUrl: { type: String, trim: true },
        rating: { type: Number, default: 0, min: 0, max: 10 },
        duration: { type: Number, default: 0 }, // total minutes

        // for pricing
        slots: [slotSchema],
        seatPrices: {
            standard: { type: Number, default: 0, min: 0 },
            recliner: { type: Number, default: 0, min: 0 },
        },

        auditorium: { type: String, trim: true, default: "Audi 1" }, // audi selection
        // people details
        cast: [personSchema],
        directors: [personSchema],
        producers: [personSchema],

        story: { type: String, trim: true },
        latestTrailer: latestTrailerSchema,
    },
    {
        timestamps: true,
    }
)

// ✅ إضافة indexes لتحسين الأداء
movieSchema.index({ type: 1 })
movieSchema.index({ categories: 1 })
movieSchema.index({ movieName: 1 })
movieSchema.index({ createdAt: -1 })

const Movie = mongoose.model("Movie", movieSchema)
export default Movie