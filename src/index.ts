import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import workspaceRoutes from "./routes/workspace.routes.js";
import collectionRoutes from "./routes/collection.routes.js";
import requestRoutes from "./routes/request.routes.js";
import folderRoutes from "./routes/folder.routes.js";
import environmentRoutes from "./routes/environment.routes.js";
import authRoutes from "./routes/auth.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { authenticate } from "./middleware/auth.middleware.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", authenticate, workspaceRoutes);
app.use("/api/collections", authenticate, collectionRoutes);
app.use("/api/folders", authenticate, folderRoutes);
app.use("/api/environments", authenticate, environmentRoutes);
app.use("/api/requests", authenticate, requestRoutes);
app.use("/api/notifications", authenticate, notificationRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-workspace", (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`Socket ${socket.id} joined workspace ${workspaceId}`);
  });

  socket.on(
    "workspace-update",
    (data: { workspaceId: string; type: string; payload: any }) => {
      // Broadcast to others in the same workspace
      socket.to(data.workspaceId).emit("workspace-change", data);
    },
  );

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 9110;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
