const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const JWKS = createRemoteJWKSet(new URL("http://localhost:3000/api/auth/jwks"));

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized: No token" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const { payload } = await jwtVerify(token, JWKS);

        req.user = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
        };

        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

async function run() {
    try {
        await client.connect();

        const database = client.db("study-nook");
        const roomsCollection = database.collection("rooms");
        const bookingsCollection = database.collection("bookings");

        // public: all rooms
        app.get("/rooms", async (req, res) => {
            const result = await roomsCollection.find().toArray();
            res.json(result);
        });

        // public: latest 6 rooms
        app.get("/latest-rooms", async (req, res) => {
            const result = await roomsCollection
                .find()
                .sort({ createdAt: -1 })
                .limit(6)
                .toArray();

            res.send(result);
        });

        // public: room details
        app.get("/rooms/:id", async (req, res) => {
            const id = req.params.id;
            const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // private: my bookings
        app.get("/bookings", verifyToken, async (req, res) => {
            const result = await bookingsCollection
                .find({ userEmail: req.user.email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        // private: my listings
        app.get("/my-listings", verifyToken, async (req, res) => {
            const result = await roomsCollection
                .find({ ownerEmail: req.user.email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        // private: add room
        app.post("/rooms", verifyToken, async (req, res) => {
            const roomData = req.body;

            roomData.ownerEmail = req.user.email;
            roomData.ownerName = req.user.name;
            roomData.bookingCount = 0;
            roomData.createdAt = new Date();

            const result = await roomsCollection.insertOne(roomData);
            res.send(result);
        });

        // private: book room
        app.post("/bookings", verifyToken, async (req, res) => {
            const bookingData = req.body;

            const existingBooking = await bookingsCollection.findOne({
                roomId: bookingData.roomId,
                date: bookingData.date,
                status: "confirmed",
                startTime: { $lt: bookingData.endTime },
                endTime: { $gt: bookingData.startTime },
            });

            if (existingBooking) {
                return res.status(409).send({
                    message: "This room is already booked for the selected time slot",
                });
            }

            bookingData.userEmail = req.user.email;
            bookingData.userName = req.user.name;
            bookingData.status = "confirmed";
            bookingData.createdAt = new Date();

            const result = await bookingsCollection.insertOne(bookingData);

            await roomsCollection.updateOne(
                { _id: new ObjectId(bookingData.roomId) },
                { $inc: { bookingCount: 1 } }
            );

            res.json(result);
        });

        // private: cancel booking
        app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
            const id = req.params.id;

            const booking = await bookingsCollection.findOne({
                _id: new ObjectId(id),
            });

            if (!booking) {
                return res.status(404).send({ message: "Booking not found" });
            }

            if (booking.userEmail !== req.user.email) {
                return res.status(403).send({
                    message: "Forbidden: This booking is not yours",
                });
            }

            const result = await bookingsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: "cancelled",
                        cancelledAt: new Date(),
                    },
                }
            );

            res.send(result);
        });

        // private: update room owner only
        app.patch("/rooms/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;

            const room = await roomsCollection.findOne({ _id: new ObjectId(id) });

            if (!room) {
                return res.status(404).send({ message: "Room not found" });
            }

            if (room.ownerEmail !== req.user.email) {
                return res.status(403).send({
                    message: "Forbidden: You are not the owner",
                });
            }

            delete updateData.ownerEmail;
            delete updateData.ownerName;

            const result = await roomsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );

            res.send(result);
        });

        // private: delete room owner only
        app.delete("/rooms/:id", verifyToken, async (req, res) => {
            const id = req.params.id;

            const room = await roomsCollection.findOne({ _id: new ObjectId(id) });

            if (!room) {
                return res.status(404).send({ message: "Room not found" });
            }

            if (room.ownerEmail !== req.user.email) {
                return res.status(403).send({
                    message: "Forbidden: You are not the owner",
                });
            }

            const result = await roomsCollection.deleteOne({
                _id: new ObjectId(id),
            });

            res.send(result);
        });

        console.log("Connected to MongoDB successfully!");
    } finally {
        // do not close client
    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("StudyNook server is running");
});

app.listen(port, () => {
    console.log(`StudyNook server listening on port ${port}`);
});