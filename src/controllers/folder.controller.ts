import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const createFolder = async (req: AuthRequest, res: Response) => {
  try {
    const { name, collectionId, parentFolderId } = req.body;
    const userId = req.userId!;

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
    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        collectionId,
        parentFolderId,
      },
    });

    io.to(collection.workspaceId).emit("workspace-change", {
      type: "FOLDER_CREATED",
      payload: folder,
    });

    res.status(201).json(folder);
  } catch (error) {
    res.status(500).json({ error: "Failed to create folder" });
  }
};

export const updateFolder = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, auth, headers, variables } = req.body;
    const userId = req.userId!;

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: { collection: true },
    });

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: folder.collection.workspaceId,
        },
      },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: { name, description, auth, headers, variables },
    });

    io.to(folder.collection.workspaceId).emit("workspace-change", {
      type: "FOLDER_UPDATED",
      payload: updatedFolder,
    });

    res.json(updatedFolder);
  } catch (error) {
    res.status(500).json({ error: "Failed to update folder" });
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: { collection: true },
    });

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: folder.collection.workspaceId,
        },
      },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.folder.delete({ where: { id } });

    io.to(folder.collection.workspaceId).emit("workspace-change", {
      type: "FOLDER_DELETED",
      payload: { id },
    });

    res.json({ message: "Folder deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete folder" });
  }
};
