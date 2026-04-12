import mongoose from "mongoose"

// Cache connection state to reuse in serverless environment
let isConnected = false;

export const connectDB = async () => {
    if (isConnected) {
        console.log("=> Using existing database connection");
        return;
    }

    try {
        const uri = process.env.MONGODB_URI
        if (!uri) {
            throw new Error("MONGODB_URI is not defined in environment variables")
        }
        
        const db = await mongoose.connect(uri, {
            retryWrites: true,
            w: "majority"
        })
        
        isConnected = db.connections[0].readyState;
        console.log("✅ DB CONNECTED SUCCESSFULLY")
    } catch (error) {
        console.error("❌ DB CONNECTION FAILED:", error.message)
        console.warn("⚠️ Server will continue running, but database-dependent features will fail.")
        isConnected = false;
    }
}