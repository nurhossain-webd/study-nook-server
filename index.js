const express = require("express");
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

async function run() {
    try {
        await client.connect();

        const database = client.db("study-nook");
        const roomsCollection = database.collection("rooms");
        const bookingsCollection = database.collection("bookings");

        app.get("/rooms", async (req, res) => {
            const result = await roomsCollection.find().toArray();
            res.json(result);
        });

        app.get("/latest-rooms", async (req, res) => {
            const result = await roomsCollection
                .find()
                .sort({ createdAt: -1 })
                .limit(6)
                .toArray();

            res.send(result);
        });
        app.get("/rooms/:id", async (req, res) => {
            const id = req.params.id;
            const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });
        app.get("/bookings", async (req, res) => {
            const email = req.query.email;

            const result = await bookingsCollection
                .find({ userEmail: email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        app.post("/rooms", async (req, res) => {
            const roomData = req.body;
            const result = await roomsCollection.insertOne(roomData);
            res.send(result);
        });
        app.post("/bookings", async (req, res) => {
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

            bookingData.status = "confirmed";
            bookingData.createdAt = new Date();

            const result = await bookingsCollection.insertOne(bookingData);

            await roomsCollection.updateOne(
                { _id: new ObjectId(bookingData.roomId) },
                { $inc: { bookingCount: 1 } }
            );

            res.json(result);
        });

        app.patch("/bookings/:id/cancel", async (req, res) => {
            const id = req.params.id;
            const email = req.body.email;

            const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

            if (!booking) {
                return res.status(404).send({ message: "Booking not found" });
            }

            if (booking.userEmail !== email) {
                return res.status(403).send({ message: "Forbidden: This booking is not yours" });
            }

            const result = await bookingsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "cancelled", cancelledAt: new Date() } }
            );

            res.send(result);
        });

        app.patch("/rooms/:id", async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const result = await roomsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );
            res.send(result);
        });

        app.delete("/rooms/:id", async (req, res) => {
            const id = req.params.id;
            const result = await roomsCollection.deleteOne({ _id: new ObjectId(id) });
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