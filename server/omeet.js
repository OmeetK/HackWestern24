const express = require("express");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

const uri = "mongodb+srv://oomeetka:@hackwestern11.rpeel.mongodb.net/";
const client = new MongoClient(uri);
const dbName = "HackWestern11";

let db;

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

startServer();