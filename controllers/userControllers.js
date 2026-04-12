import User from "../models/userModel.js";
import bcrypt from "bcryptjs"; 
import jwt from "jsonwebtoken";

const JWT_SECRET = 'your_jwt_secret_here'
const TOKEN_EXPIRES_IN = '24h'

/* ---------------- helpers ---------------- */
const emailIsValid = (e) => /\S+@\S+\.\S+/.test(String(e || ""));
const extractCleanPhone = (p) => String(p || "").replace(/\D/g, "");
const mkToken = (payload) => jwt.sign(payload, JWT_SECRET, {expiresIn: TOKEN_EXPIRES_IN});

// REGISTER FUNCTION (تم التصحيح)
export const registerUser = async (req, res) => {
  try {
    const { fullName, username, email, phone, birthDate, password } = req.body || {};
    
    if (!fullName || !username || !email || !phone || !birthDate || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // التحقق من الاسم الكامل
    if (typeof fullName !== "string" || fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Full name must be at least 2 characters",
      });
    }

    // التحقق من اسم المستخدم
    if (typeof username !== "string" || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "User name must be at least 3 characters",
      });
    }

    // التحقق من البريد الإلكتروني
    if (!emailIsValid(email)) {
      return res.status(400).json({
        success: false,
        message: "Email is invalid",
      });
    }

    // التحقق من رقم الهاتف
    const cleanPhone = extractCleanPhone(phone);
    if (cleanPhone.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Phone number seems invalid",
      });
    }

    // التحقق من كلمة المرور
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    // التحقق من تاريخ الميلاد
    const parsedBirth = new Date(birthDate);
    if (Number.isNaN(parsedBirth.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Birth date invalid",
      });
    }

    // التحقق من البريد الإلكتروني الموجود
    const existingByEmail = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // التحقق من اسم المستخدم الموجود
    const existByUsername = await User.findOne({
      username: username.trim().toLowerCase(),
    });
    if (existByUsername) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10); 
    const hashedPassword = await bcrypt.hash(password, salt);

    // إنشاء المستخدم الجديد
    const newUser = await User.create({
      fullName: fullName.trim(),
      username: username.trim().toLowerCase(),
      email: email.toLowerCase().trim(),
      phone: cleanPhone, 
      birthDate: parsedBirth,
      password: hashedPassword,
    });

    // إنشاء التوكن
    const token = mkToken({ id: newUser._id, role: newUser.role });


    // إعداد بيانات المستخدم للعودة
    const userToReturn = {
      id: newUser._id,
      fullName: newUser.fullName,
      username: newUser.username,
      email: newUser.email,
      phone: newUser.phone,
      birthDate: newUser.birthDate,
      role: newUser.role
    };


    return res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      token,
      user: userToReturn
    });

  } catch (err) {
    console.error('Register error:', err); 
    if (err.code === 11000) {
      const dubKey = Object.keys(err.keyValue || {})[0];
      return res.status(400).json({
        success: false,
        message: `${dubKey} already exists.`
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// LOGIN FUNCTION (تم التصحيح)
export const login = async (req, res) => { 
  try {
    console.log("Login request received");
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) { 
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = mkToken({ id: user._id.toString(), role: user.role });

    return res.status(200).json({
      success: true, 
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        fullName: user.fullName, 
        username: user.username,
        email: user.email,
        role: user.role
      }

    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error: ' + err.message
    });
  }
};

// GET ALL USERS (Admin)
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    return res.status(200).json({
      success: true,
      items: users
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE USER (Admin)
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE USER ROLE (Admin)
export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select('-password');
    return res.status(200).json({
      success: true,
      message: 'User role updated',
      user
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};