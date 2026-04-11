import mongoose from "mongoose";
import Stripe from "stripe";
import Booking from "../models/bookingModel.js";
import Movie from "../models/movieModel.js";

/**
 * Helper to initialize Stripe safely
 */
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe Secret Key is missing from environment variables.");
  }
  return new Stripe(secretKey);
};

/**
 * 1. CREATE BOOKING & STRIPE SESSION
 * Logic: Validates slots, calculates price, checks seat availability, creates pending booking + Stripe session.
 */
export async function createBooking(req, res) {
  try {
    const { movieId, movieName, seats, showtime, auditorium, email, paymentMethod = "card", customerName } = req.body;
    const userId = req.user?._id; // From authMiddleware

    // 1. Basic Validation
    if (!movieId || !seats || !seats.length || !showtime) {
      return res.status(400).json({ success: false, message: "Missing required booking details (movie, seats, or showtime)." });
    }

    // 2. Fetch Movie for accurate pricing and details
    const movie = await Movie.findById(movieId).lean();
    if (!movie) {
      return res.status(404).json({ success: false, message: "Movie not found." });
    }

    // 3. Prevent Double Booking (Conflict Detection)
    // Find already 'paid' or 'confirmed' bookings for this showtime and audi
    const existingBookings = await Booking.find({
      "movie.id": movieId,
      showtime: new Date(showtime),
      auditorium: auditorium || movie.auditorium,
      status: { $in: ["paid", "confirmed"] }
    }).lean();

    const occupiedSeats = new Set();
    existingBookings.forEach(b => b.seats.forEach(s => occupiedSeats.add(s.id || s)));

    const isDoubleBooked = seats.some(s => occupiedSeats.has(s.id || s));
    if (isDoubleBooked) {
      return res.status(409).json({ success: false, message: "One or more selected seats are already booked. Please refresh and try again." });
    }

    // 4. Calculate Total Amount
    let totalAmount = 0;
    const currency = "INR";
    const prices = movie.seatPrices || { standard: 200, recliner: 400 };

    const seatDetails = seats.map(s => {
      const isRecliner = String(s.row || "").match(/[D-E]/i); // Rows D and E are recliners
      const price = isRecliner ? prices.recliner : prices.standard;
      totalAmount += price;
      return { 
        id: s.id || `${s.row}${s.col}`, 
        row: s.row, 
        col: s.col, 
        type: isRecliner ? "recliner" : "standard", 
        price 
      };
    });

    // 5. Create the Booking Record (Pending)
    const booking = new Booking({
      movieId,
      userId,
      customer: customerName || req.user?.name || "Guest",
      movie: {
        id: movie._id,
        title: movie.movieName,
        poster: movie.poster,
        durationMins: movie.duration,
        category: movie.categories?.[0] || ""
      },
      showtime: new Date(showtime),
      auditorium: auditorium || movie.auditorium || "Audi 1",
      seats: seatDetails,
      amount: totalAmount,
      amountPaise: totalAmount * 100, // For Stripe
      currency,
      status: "pending",
      paymentStatus: "pending",
      paymentMethod
    });

    await booking.save();

    // 6. Create Stripe Checkout Session
    let session;
    try {
      const stripe = getStripe();
      session = await stripe.checkout.sessions.create({
        payment_method_types: [paymentMethod],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `${movie.movieName} - Ticket Booking`,
                description: `Seats: ${seatDetails.map(s => `${s.row}${s.col}`).join(", ")} | Showtime: ${new Date(showtime).toLocaleString()}`,
                images: [movie.poster].filter(Boolean),
              },
              unit_amount: totalAmount * 100, // In paise/cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        // Pass booking ID in metadata to retrieve it during confirmation
        metadata: { bookingId: booking._id.toString() },
        success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL}/cancel?booking_id=${booking._id}`,
      });

      // Update booking with session ID
      booking.paymentSessionId = session.id;
      await booking.save();

    } catch (stripeErr) {
      // If Stripe fails, we clean up the pending booking to avoid clutter
      await Booking.findByIdAndDelete(booking._id);
      console.error("Stripe Session Error:", stripeErr);
      return res.status(500).json({ success: false, message: "Payment Gateway Error: " + stripeErr.message });
    }

    return res.status(201).json({
      success: true,
      message: "Booking initialized.",
      bookingId: booking._id,
      checkout: { id: session.id, url: session.url }
    });

  } catch (err) {
    console.error("createBooking error:", err);
    return res.status(500).json({ success: false, message: "Server error during booking creation." });
  }
}

/**
 * 2. CONFIRM PAYMENT
 * Logic: Verifies Stripe session, updates booking status.
 */
export async function confirmPayment(req, res) {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ success: false, message: "Session ID is required." });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) return res.status(404).json({ success: false, message: "Payment session not found." });

    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return res.status(400).json({ success: false, message: "No booking metadata found in session." });

    if (session.payment_status === "paid") {
      const updatedBooking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          status: "confirmed",
          paymentStatus: "paid",
          paymentIntentId: session.payment_intent || ""
        },
        { new: true }
      );

      return res.json({ success: true, message: "Payment confirmed.", booking: updatedBooking });
    } else {
      return res.status(400).json({ success: false, message: "Payment has not been completed yet." });
    }
  } catch (err) {
    console.error("confirmPayment error:", err);
    return res.status(500).json({ success: false, message: "Server error during payment confirmation." });
  }
}

/**
 * 3. GET OCCUPIED SEATS
 * Logic: Returns an array of seat IDs that are already confirmed for a showtime.
 */
export async function getOccupiedSeats(req, res) {
  try {
    const { movieId, showtime, auditorium } = req.query;

    if (!movieId || !showtime) {
      return res.status(400).json({ success: false, message: "movieId and showtime are required." });
    }

    const bookings = await Booking.find({
      "movie.id": movieId,
      showtime: new Date(showtime),
      auditorium: auditorium || { $exists: true },
      status: { $in: ["confirmed", "paid"] }
    }).lean();

    const occupied = [];
    bookings.forEach(b => {
      b.seats.forEach(s => occupied.push(s.id || s));
    });

    return res.json({ success: true, occupied });
  } catch (err) {
    console.error("getOccupiedSeats error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch occupied seats." });
  }
}

/**
 * 4. LIST BOOKINGS (Paginated for Admin)
 */
export async function listBookings(req, res) {
  try {
    const { page = 1, limit = 10, userId } = req.query;
    const filter = userId ? { userId } : {};

    const pg = Math.max(1, parseInt(page));
    const lim = Math.max(1, parseInt(limit));

    const total = await Booking.countDocuments(filter);
    const items = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean();

    return res.json({ success: true, total, page: pg, limit: lim, items });
  } catch (err) {
    console.error("listBookings error:", err);
    return res.status(500).json({ success: false, message: "Failed to list bookings." });
  }
}

/**
 * 5. GET SINGLE BOOKING
 */
export async function getBooking(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid booking ID." });

    const booking = await Booking.findById(id).lean();
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });

    return res.json({ success: true, booking });
  } catch (err) {
    console.error("getBooking error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

/**
 * 6. UPDATE BOOKING
 */
export async function updateBooking(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid booking ID." });

    const updated = await Booking.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Booking not found." });

    return res.json({ success: true, message: "Booking updated.", booking: updated });
  } catch (err) {
    console.error("updateBooking error:", err);
    return res.status(500).json({ success: false, message: "Update failed." });
  }
}

/**
 * 7. DELETE BOOKING
 */
export async function deleteBooking(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: "Invalid booking ID." });

    const deleted = await Booking.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Booking not found." });

    return res.json({ success: true, message: "Booking deleted successfully." });
  } catch (err) {
    console.error("deleteBooking error:", err);
    return res.status(500).json({ success: false, message: "Deletion failed." });
  }
}

export default {
  createBooking,
  confirmPayment,
  getOccupiedSeats,
  listBookings,
  getBooking,
  updateBooking,
  deleteBooking
};
