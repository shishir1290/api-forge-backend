import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const createCollection = async (req: AuthRequest, res: Response) => {
  try {
    const { name, workspaceId } = req.body;
    const userId = req.userId!;

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (membership.role.toUpperCase() === "VIEWER") {
      return res
        .status(403)
        .json({ error: "Viewers cannot create collections" });
    }

    const collection = await prisma.collection.create({
      data: {
        name,
        workspaceId,
      },
    });

    // Notify others in the workspace
    io.to(workspaceId).emit("workspace-change", {
      type: "COLLECTION_CREATED",
      payload: collection,
    });

    res.status(201).json(collection);
  } catch (error) {
    res.status(500).json({ error: "Failed to create collection" });
  }
};

export const getCollections = async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const userId = req.userId!;

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const collections = await prisma.collection.findMany({
      where: {
        workspaceId,
      },
      include: {
        requests: true,
        folders: true,
      },
    });
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch collections" });
  }
};

export const deleteCollection = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { workspaceId: true },
    });

    if (!collection) {
      return res.status(404).json({ error: "Collection not found" });
    }

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: collection.workspaceId },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (membership.role.toUpperCase() === "VIEWER") {
      return res
        .status(403)
        .json({ error: "Viewers cannot delete collections" });
    }

    // Cascading delete
    await prisma.$transaction([
      prisma.request.deleteMany({ where: { collectionId: id } }),
      prisma.folder.deleteMany({ where: { collectionId: id } }),
      prisma.collection.delete({ where: { id } }),
    ]);

    // Notify others
    io.to(collection.workspaceId).emit("workspace-change", {
      type: "COLLECTION_DELETED",
      payload: { id },
    });

    res.json({ message: "Collection deleted successfully" });
  } catch (error) {
    console.error("Delete collection error:", error);
    res.status(500).json({ error: "Failed to delete collection" });
  }
};
