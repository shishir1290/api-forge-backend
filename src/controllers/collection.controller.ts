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
export const importCollections = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, collections } = req.body;
    const userId = req.userId!;

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    const createdCollections = [];

    for (const colData of collections) {
      const collection = await prisma.$transaction(async (tx) => {
        // 1. Create Collection
        const newCol = await tx.collection.create({
          data: {
            name: colData.name,
            description: colData.description,
            auth: colData.auth,
            headers: colData.headers,
            variables: colData.variables,
            workspaceId,
          },
        });

        // 2. Define recursive folder creator
        const createFolders = async (
          folders: any[],
          parentId: string | null,
        ) => {
          for (const f of folders) {
            const newFolder = await tx.folder.create({
              data: {
                name: f.name,
                description: f.description,
                auth: f.auth,
                headers: f.headers,
                variables: f.variables,
                collectionId: newCol.id,
                parentFolderId: parentId,
              },
            });

            // Create requests in this folder
            if (f.requests && f.requests.length > 0) {
              await tx.request.createMany({
                data: f.requests.map((r: any) => ({
                  name: r.name,
                  method: r.method,
                  url: r.url,
                  description: r.description,
                  headers: r.headers,
                  params: r.params,
                  body: r.body,
                  auth: r.auth,
                  preRequestScript: r.preRequestScript,
                  postRequestScript: r.postRequestScript,
                  collectionId: newCol.id,
                  folderId: newFolder.id,
                })),
              });
            }

            // Recurse subfolders
            if (f.folders && f.folders.length > 0) {
              await createFolders(f.folders, newFolder.id);
            }
          }
        };

        // 3. Create top-level requests
        if (colData.requests && colData.requests.length > 0) {
          await tx.request.createMany({
            data: colData.requests.map((r: any) => ({
              name: r.name,
              method: r.method,
              url: r.url,
              description: r.description,
              headers: r.headers,
              params: r.params,
              body: r.body,
              auth: r.auth,
              preRequestScript: r.preRequestScript,
              postRequestScript: r.postRequestScript,
              collectionId: newCol.id,
            })),
          });
        }

        // 4. Create folders recursively
        if (colData.folders && colData.folders.length > 0) {
          await createFolders(colData.folders, null);
        }

        // Fetch the full collection to return and notify
        return tx.collection.findUnique({
          where: { id: newCol.id },
          include: {
            requests: { where: { folderId: null } },
            folders: { include: { requests: true, subFolders: true } }, // Note: Recursive include in Prisma is limited
          },
        });
      });

      if (collection) {
        createdCollections.push(collection);
        io.to(workspaceId).emit("workspace-change", {
          type: "COLLECTION_CREATED",
          payload: collection,
        });
      }
    }

    res.status(201).json(createdCollections);
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: "Failed to import collections" });
  }
};
