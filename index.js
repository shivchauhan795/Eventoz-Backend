import express from "express"
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import authMiddleware from './auth.js'
import cors from 'cors'

import bodyParser from 'body-parser'

dotenv.config()

const mongourl = process.env.MONGO_URL
const client = new MongoClient(mongourl, {
    tls: true,  // Enable TLS
    tlsInsecure: false,  // Ensure certificates are validated
    connectTimeoutMS: 10000,
})
const dbName = 'eventoz'
const app = express()
const port = process.env.PORT || 3000;
await client.connect()


// app.use(cors());
app.use(cors({
    origin: 'https://eventoz.netlify.app', // Specify your frontend domain
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true // Allow cookies or other credentials to be sent
}));
app.options('*', cors()); // Preflight response to all routes


app.use(bodyParser.json())


// register 
app.post("/register", async (request, response) => {
    try {
        const hashedPassword = await bcrypt.hash(request.body.password, 10);
        const db = client.db(dbName);
        const collection = db.collection('users');
        const user = {
            email: request.body.email,
            password: hashedPassword,
        }

        const alreadyExist = await collection.findOne({ email: request.body.email })

        if (alreadyExist) {
            return response.status(409).send({
                message: "User with this email already exists",
            });
        }

        const result = await collection.insertOne(user);
        response.status(201).send({
            message: "User Created Successfully",
            result,
        });


    } catch (error) {
        response.status(500).send({
            message: "Error creating user",
            error,
        });
    }

});

//login
app.post("/login", async (request, response) => {
    try {
        const db = client.db(dbName);
        const collection = db.collection('users');
        const user = await collection.findOne({ email: request.body.email });
        if (!user) {
            return response.status(404).send({
                message: "Email not found",
            });
        }
        const match = await bcrypt.compare(request.body.password, user.password);

        if (!match) {
            return response.status(401).send({
                message: "Invalid password",
            });
        }

        const token = jwt.sign(
            {
                userId: user._id,
                userEmail: user.email,
            },
            "RANDOM-TOKEN",
            { expiresIn: "24h" }
        );
        response.status(200).send({
            message: "Login successful",
            user: {
                email: user.email,
                token,
            }
        });

    } catch (error) {
        response.status(404).send({
            message: "Email not found",
            error,
        });
    }
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

// createevent
app.post('/createevent', authMiddleware, async (request, response) => {
    try {
        const userId = request.userId; // Ensure authMiddleware sets this
        const db = client.db(dbName);
        const collection = db.collection('events');
        const eventDetails = {
            eventName: request.body.eventName,
            eventDesc: request.body.eventDesc,
            date: request.body.date,
            banner: request.body.banner,
            id: request.body.id,
            userId: userId // Associate event with user
        };
        const result = await collection.insertOne(eventDetails);
        response.status(201).send({
            message: "Event Created Successfully",
            result,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error creating event",
            error: error.message, // Add error message to response for debugging
        });
    }
});


// Fetch Events for a User
app.get('/myevents', authMiddleware, async (request, response) => {
    try {
        const userId = request.userId; // Ensure authMiddleware sets this
        const db = client.db(dbName);
        const collection = db.collection('events');
        const events = await collection.find({ userId }).toArray();
        response.status(200).send({
            message: "Events fetched successfully",
            events,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error fetching events",
            error,
        });
    }
});

// Endpoint to register a user for an event
app.post('/eventregistereduser', async (request, response) => {
    try {
        // const userId = request.userId; // Ensure authMiddleware sets this
        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');
        const registrationData = {
            ...request.body,
            // userId: userId, // this is id of the organizer user
            registered: true,
            attended: false,
            createdAt: new Date()
        };
        const result = await collection.insertOne(registrationData);
        response.status(201).send({
            message: "User registered successfully for the event",
            result,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error registering user for the event",
            error: error.message,
        });
    }
});

// Endpoint to get the number of registered users for a specific event
app.get('/event/:id/registrations', async (request, response) => {
    try {
        const { id } = request.params; // Event ID (formId)

        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');

        const registrationCount = await collection.countDocuments({
            formId: id,
            registered: true
        });

        response.status(200).send({
            message: "Registration count fetched successfully",
            registrationCount,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error fetching registration count",
            error: error.message,
        });
    }
});

// Endpoint to get the number of attended users for a specific event
app.get('/event/:id/attended', async (request, response) => {
    try {
        const { id } = request.params; // Event ID (formId)

        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');

        const attendedCount = await collection.countDocuments({
            formId: id,
            registered: true,
            attended: true,
        });

        response.status(200).send({
            message: "Attended count fetched successfully",
            attendedCount,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error fetching attended count",
            error: error.message,
        });
    }
});

// Endpoint to fetch registered users for a specific event
app.get('/registeredusers/:formId', async (request, response) => {
    try {
        // const userId = request.userId; // Organizer's userId
        const { formId } = request.params; // Form ID from the URL
        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');
        const registeredUsers = await collection.find({ formId, registered: true }).toArray();

        response.status(200).send({
            message: "Registered users fetched successfully",
            registeredUsers,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error fetching registered users",
            error: error.message,
        });
    }
});

// Endpoint to fetch attended users for a specific event
app.get('/attendedusers/:formId', async (request, response) => {
    try {
        const { formId } = request.params; // Form ID from the URL
        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');
        const attendedUsers = await collection.find({ formId, registered: true, attended: true }).toArray();

        response.status(200).send({
            message: "Attended users fetched successfully",
            attendedUsers,
        });
    } catch (error) {
        response.status(500).send({
            message: "Error fetching attended users",
            error: error.message,
        });
    }
});


// Endpoint to mark a user as attended for a specific event
app.post('/updateAttendance', async (request, response) => {
    try {
        const { id } = request.body; // Expect id in the request body

        const db = client.db(dbName);
        const collection = db.collection('eventRegisteredUsers');

        // console.log('Received ID:', id); // Log received ID for debugging

        // Assuming 'id' is a string and needs to be matched as-is
        const registration = await collection.findOne({ id: id, registered: true });

        if (!registration) {
            return response.status(404).send({
                message: "User or registration not found",
            });
        }

        // Update the 'attended' field to true for the specific user and event
        const result = await collection.updateOne(
            { id: id, registered: true },
            { $set: { attended: true } }
        );

        if (result.matchedCount === 0) {
            return response.status(404).send({
                message: "User or registration not found",
            });
        }

        response.status(200).send({
            message: "Attendance updated successfully",
            name: registration.name,
        });
    } catch (error) {
        console.error('Error updating attendance:', error); // Log error details
        response.status(500).send({
            message: "Error updating attendance",
            error: error.message,
        });
    }
});



app.listen(port, '0.0.0.0', () => {
    console.log(`Example app listening on port ${port}`);
});



// free endpoint
app.get("/free-endpoint", (request, response) => {
    response.json({ message: "You are free to access me anytime" });
});

// authentication endpoint
app.get("/auth-endpoint", authMiddleware, (request, response) => {
    response.json({ message: "You are authorized to access me" });
});