const express = require("express");
require("dotenv").config();

const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 8000;

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

        app.get("/rooms", async (req, res) => {
            const result = await roomsCollection
                .find()
                .sort({ createdAt: -1 })
                .limit(6)
                .toArray();

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