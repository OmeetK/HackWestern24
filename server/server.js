const express = require("express");
const { expressjwt: jwt } = require("express-jwt");
const jwks = require("jwks-rsa");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
const jwtLib = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());

// Auth0 Config
const AUTH0_DOMAIN = "dev-h32e7d3l5lrftxe4.us.auth0.com";
const AUTH0_AUDIENCE = "https://dev-h32e7d3l5lrftxe4.us.auth0.com/api/v2/";
const JWT_SECRET = "your_jwt_secret"; // Replace with a secure value in production

// MongoDB Config
const MONGO_URI = "mongodb+srv://seabar:12345@hackwestern11.rpeel.mongodb.net/?retryWrites=true&w=majority&appName=HackWestern11";
const client = new MongoClient(MONGO_URI);

// Middleware to check JWT
const checkJwt = jwt({
    secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`, // Replace with your Auth0 domain
    }),
    audience: AUTH0_AUDIENCE, // Replace with your Auth0 audience
    issuer: `https://${AUTH0_DOMAIN}/`, // Replace with your Auth0 domain
    algorithms: ["RS256"],
});

// Apply CORS middleware before defining routes
app.use(cors({
    origin: "http://localhost:5173", // Replace with your React frontend URL
    methods: ["GET", "POST"],
    credentials: true
}));

// Connect to MongoDB
client.connect();
const db = client.db("HackWestern11");
const users = db.collection("user");
const admins = db.collection("admin");

console.log("MongoDB connected. Collections initialized:", {
    usersCollection: !!users,
    adminsCollection: !!admins,
});

// ** 1. Registration Endpoint **
app.post("/api/register", async (req, res) => {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
        return res.status(400).json({ error: "Email, password, and nickname are required" });
    }

    try {
        const existingUser = await users.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user to MongoDB
        const newUser = {
            email,
            password: hashedPassword,
            nickname,
            createdAt: new Date(),
        };

        await users.insertOne(newUser);

        res.status(201).json({ message: "User registered successfully", user: { email, nickname } });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).json({ error: "Failed to register user" });
    }
});

// ** 2. Login Endpoint for Users **
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const user = await users.findOne({ email });

        console.log("User fetched from DB:", user);

        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log("Password comparison result:", isPasswordValid);

        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwtLib.sign(
            {
                userId: user._id,
                email: user.email,
                nickname: user.nickname,
            },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.status(200).json({ message: "Login successful", token });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "Failed to log in" });
    }
});

// ** 3. Login Endpoint for Admin **
app.post("/api/loginAdmin", async (req, res) => {
    const { email, password } = req.body;

    console.log("Received loginAdmin request with data:", { email, password });

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const admin = await admins.findOne({ email });
        console.log("Admin fetched from DB:", admin);

        if (!admin) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        console.log("Password comparison result for admin:", isPasswordValid);

        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwtLib.sign(
            {
                adminId: admin._id,
                email: admin.email,
                nickname: admin.nickname,
            },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.status(200).json({ message: "Login successful", token });
    } catch (error) {
        console.error("Error during admin login:", error);
        res.status(500).json({ error: "Failed to log in" });
    }
});

async function getNextSequenceValue(sequenceName) {
    try {
      const counter = await db.collection("counters").findOne({ _id: sequenceName });
      
      if (!counter) {
        const initResult = await db.collection("counters").insertOne({
          _id: sequenceName,
          sequence_value: 1
        });
        return 1;
      }
      
      const result = await db.collection("counters").findOneAndUpdate(
        { _id: sequenceName },
        { $inc: { sequence_value: 1 } },
        { returnDocument: "after" }
      );
      
      return result.sequence_value;
    } catch (error) {
      console.error("Error in getNextSequenceValue:", error);
      throw error;
    }
  }

app.post("/api/parking-location", async (req, res) => {
  try {
    const {
      location_name,
      total_spots,
      full_location,
      is_accessibility_spot,
      is_bigger,
      is_ev,
      is_expecting,
      is_front_spot,
      is_carpool,  // Added new attribute
    } = req.body;

    if (!location_name || !total_spots || !full_location) {
      return res.status(400).json({
        error: "Location name, total spots, and full location are required.",
      });
    }

    const location_id = await getNextSequenceValue("locationId");
    console.log("Generated location_id:", location_id);

    const parkingLocation = {
      location_id,
      location_name,
      total_spots: parseInt(total_spots, 10),
      full_location,
      is_accessibility_spot: parseInt(is_accessibility_spot || 0, 10),
      is_bigger: parseInt(is_bigger || 0, 10),
      is_ev: parseInt(is_ev || 0, 10),
      is_expecting: parseInt(is_expecting || 0, 10),
      is_front_spot: parseInt(is_front_spot || 0, 10),
      is_carpool: parseInt(is_carpool || 0, 10),  // Added new attribute with default 0
    };

    const result = await db.collection("Parking_Locations").insertOne(parkingLocation);
    console.log("Insertion result:", result);

    res.status(201).json({
      success: true,
      data: {
        ...parkingLocation,
        _id: result.insertedId
      }
    });

  } catch (error) {
    console.error("Error in POST /api/parking-location:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to save parking location",
      details: error.message
    });
  }
});

app.get("/api/parking-locations", async (req, res) => {
  try {
    const locations = await db.collection("Parking_Locations").find().toArray();
    res.status(200).json({ success: true, data: locations });
  } catch (error) {
    console.error("Error retrieving parking locations:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to retrieve parking locations" 
    });
  }
});


app.post("/api/reservations", async (req, res) => {
    try {
      const { spot_id, user_email } = req.body;
  
      // Validate required fields
      if (!spot_id || !user_email) {
        return res.status(400).json({
          success: false,
          error: "Spot ID and user email are required"
        });
      }
  
      // Verify user exists
      const userExists = await db.collection("user").findOne({ email: user_email });
      if (!userExists) {
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }
  
      // Check if spot exists and is available
      const availableSpot = await db.collection("Available_Spots").findOne({
        spot_number: parseInt(spot_id),
        is_available: true
      });
  
      if (!availableSpot) {
        return res.status(404).json({
          success: false,
          error: "Spot not found or is not available"
        });
      }
  
      // Generate new reservation ID
      const reservation_id = await getNextSequenceValue("reservationId");
  
      // Create reservation with today's date and user email
      const reservation = {
        _id: reservation_id,
        reservation_id: reservation_id,
        location_id: availableSpot.location_id,
        spot_number: availableSpot.spot_number,
        reservation_date: new Date(),
        is_carpool: availableSpot.is_carpool || false,
        email: user_email  // Add user email to reservation
      };
  
      // Insert the reservation
      const reservationResult = await db.collection("Reservations").insertOne(reservation);
  
      // Update the spot to be unavailable
      await db.collection("Available_Spots").updateOne(
        { spot_number: parseInt(spot_id) },
        { $set: { is_available: false } }
      );
  
      res.status(201).json({
        success: true,
        data: {
          ...reservation,
          _id: reservationResult.insertedId
        },
        message: "Reservation created successfully"
      });
  
    } catch (error) {
      console.error("Error creating reservation:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create reservation",
        details: error.message
      });
    }
  });

  app.post("/api/parking-location", async (req, res) => {
    try {
      const {
        location_name,
        total_spots,
        full_location,
        is_accessibility_spot,
        is_bigger,
        is_ev,
        is_expecting,
        is_front_spot,
      } = req.body;
  
      // Validate required fields
      if (!location_name || !total_spots || !full_location) {
        return res.status(400).json({
          error: "Location name, total spots, and full location are required.",
        });
      }
  
      // Get admin email from admin collection
      const adminDoc = await db.collection("admin").findOne({});
      if (!adminDoc || !adminDoc.email) {
        return res.status(400).json({
          error: "Admin email not found",
        });
      }
  
      // Get next location ID
      const location_id = await getNextSequenceValue("locationId");
      console.log("Generated location_id:", location_id);
  
      const parkingLocation = {
        location_id,
        location_name,
        total_spots: parseInt(total_spots, 10),
        full_location,
        is_accessibility_spot: parseInt(is_accessibility_spot || 0, 10),
        is_bigger: parseInt(is_bigger || 0, 10),
        is_ev: parseInt(is_ev || 0, 10),
        is_expecting: parseInt(is_expecting || 0, 10),
        is_front_spot: parseInt(is_front_spot || 0, 10),
        email: adminDoc.email  // Add admin email to the parking location
      };
  
      // Insert the document
      const result = await db.collection("Parking_Locations").insertOne(parkingLocation);
      console.log("Insertion result:", result);
  
      // Send response
      res.status(201).json({
        success: true,
        data: {
          ...parkingLocation,
          _id: result.insertedId
        }
      });
  
    } catch (error) {
      console.error("Error in POST /api/parking-location:", error);
      res.status(500).json({
        success: false,
        error: "Failed to save parking location",
        details: error.message
      });
    }
  });

  
app.post("/api/clear-available-spots", async (req, res) => {
    try {
      const { location_id } = req.body;
  
      if (!location_id) {
        return res.status(400).json({
          success: false,
          error: "Location ID is required"
        });
      }
  
      const result = await db.collection("Available_Spots").deleteMany(
        { location_id: parseInt(location_id) }
      );
  
      res.status(200).json({
        success: true,
        message: "Available spots cleared successfully",
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error("Error clearing available spots:", error);
      res.status(500).json({
        success: false,
        error: "Failed to clear available spots",
        details: error.message
      });
    }
  });

  app.post("/api/generate-available-spots", async (req, res) => {
    try {
      const { location_id } = req.body;
  
      // Find the parking location
      const parkingLocation = await db.collection("Parking_Locations").findOne(
        { location_id: parseInt(location_id) }
      );
  
      if (!parkingLocation) {
        return res.status(404).json({
          success: false,
          error: "Parking location not found"
        });
      }
  
      const availableSpots = [];
      let spotCount = {
        accessibility: parkingLocation.is_accessibility_spot,
        bigger: parkingLocation.is_bigger,
        ev: parkingLocation.is_ev,
        expecting: parkingLocation.is_expecting,
        front: parkingLocation.is_front_spot
      };
  
      // Generate spots for total_spots
      for (let i = 1; i <= parkingLocation.total_spots; i++) {
        let spot = {
          location_id: parkingLocation.location_id,
          spot_number: i,
          is_available: true,
          is_accessibility_spot: false,
          is_front_spot: false,
          is_bigger: false,
          is_ev: false,
          is_expecting: false,
          is_carpool: false
        };
  
        // Assign special attributes based on remaining counts
        if (spotCount.accessibility > 0) {
          spot.is_accessibility_spot = true;
          spotCount.accessibility--;
        }
        else if (spotCount.bigger > 0) {
          spot.is_bigger = true;
          spotCount.bigger--;
        }
        else if (spotCount.ev > 0) {
          spot.is_ev = true;
          spotCount.ev--;
        }
        else if (spotCount.expecting > 0) {
          spot.is_expecting = true;
          spotCount.expecting--;
        }
        else if (spotCount.front > 0) {
          spot.is_front_spot = true;
          spotCount.front--;
        }
  
        availableSpots.push(spot);
      }
  
      // Insert all spots into Available_Spots collection
      const result = await db.collection("Available_Spots").insertMany(availableSpots);
  
      res.status(201).json({
        success: true,
        data: {
          location_id: parkingLocation.location_id,
          total_spots_created: result.insertedCount,
          spots: availableSpots
        },
        message: "Available spots generated successfully"
      });
  
    } catch (error) {
      console.error("Error generating available spots:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate available spots",
        details: error.message
      });
    }
  });

// Start the server
app.listen(3000, () => {
    console.log("Server running on port 3000");
});
