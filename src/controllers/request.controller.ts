import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const createRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { name, method, url, collectionId, headers, body } = req.body;
    const userId = req.userId!;

    // Check if user has access to the collection's workspace
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { workspace: { include: { members: true } } },
    });

    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const membership = collection.workspace.members.find(
      (m) => m.userId === userId,
    );

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Viewers cannot create requests" });
    }

    const apiRequest = await prisma.request.create({
      data: {
        name,
        method,
        url,
        collectionId,
        headers,
        body,
      },
      include: {
        collection: true,
      },
    });

    // Notify others in the workspace
    if (apiRequest.collection) {
      io.to(apiRequest.collection.workspaceId).emit("workspace-change", {
        type: "REQUEST_CREATED",
        payload: apiRequest,
      });
    }

    res.status(201).json(apiRequest);
  } catch (error) {
    res.status(500).json({ error: "Failed to create request" });
  }
};

export const updateRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, method, url, headers, body } = req.body;
    const userId = req.userId!;

    const apiRequest = await prisma.request.findUnique({
      where: { id },
      include: {
        collection: { include: { workspace: { include: { members: true } } } },
      },
    });

    if (!apiRequest) {
      return res.status(404).json({ error: "Request not found" });
    }

    const membership = apiRequest.collection?.workspace.members.find(
      (m) => m.userId === userId,
    );

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Viewers cannot update requests" });
    }

    const updatedRequest = await prisma.request.update({
      where: { id },
      data: {
        name,
        method,
        url,
        headers,
        body,
      },
      include: {
        collection: true,
      },
    });

    // Notify others in the workspace
    if (updatedRequest.collection) {
      io.to(updatedRequest.collection.workspaceId).emit("workspace-change", {
        type: "REQUEST_UPDATED",
        payload: updatedRequest,
      });
    }

    res.json(updatedRequest);
  } catch (error) {
    res.status(500).json({ error: "Failed to update request" });
  }
};

export const getRequests = async (req: AuthRequest, res: Response) => {
  try {
    const collectionId = req.params.collectionId as string;
    const userId = req.userId!;

    // Check membership
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { workspace: { include: { members: true } } },
    });

    if (
      !collection ||
      !collection.workspace.members.some((m) => m.userId === userId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const requests = await prisma.request.findMany({
      where: {
        collectionId,
      },
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
};
