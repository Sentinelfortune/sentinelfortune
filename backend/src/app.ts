import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import stripeRouter from "./routes/stripe";

const app: Express = express();

app.use(cors());

// Stripe webhook must be mounted BEFORE express.json() so the raw body
// bytes are preserved for signature verification in the bot.
app.use("/api/stripe", stripeRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
