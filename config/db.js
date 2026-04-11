import mongoose from "mongoose"

export const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI
        if (!uri) {
            throw new Error("MONGODB_URI is not defined in environment variables")
        }
        await mongoose.connect(uri, {
            retryWrites: true,
            w: "majority"
        })
        console.log("✅ DB CONNECTED SUCCESSFULLY")
    } catch (error) {
        console.error("❌ DB CONNECTION FAILED:", error.message)
        console.warn("⚠️ Server will continue running, but database-dependent features will fail.")
    }
}