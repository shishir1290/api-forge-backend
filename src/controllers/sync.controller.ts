import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";

export const syncCollections = async (req: any, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { collections, environments } = req.body;
    const userId = req.userId!;

    // Check membership
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    });

    if (!member) {
      return res.status(403).json({ error: "Access denied" });
    }

    const role = member.role.toUpperCase();
    if (role === "VIEWER") {
      return res.status(403).json({ error: "Viewers cannot sync changes" });
    }

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Ensure workspace exists
      const ws = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!ws) throw new Error("Workspace not found");

      // 1. Sync Collections
      for (const col of collections || []) {
        await tx.collection.upsert({
          where: { id: col.id },
          create: {
            id: col.id,
            name: col.name,
            description: col.description,
            auth: col.auth,
            headers: col.headers,
            variables: col.variables,
            workspaceId,
          },
          update: {
            name: col.name,
            description: col.description,
            auth: col.auth,
            headers: col.headers,
            variables: col.variables,
          },
        });

        await syncFoldersAndRequests(
          tx,
          col.id,
          null,
          col.folders || [],
          col.requests || [],
        );
      }

      // 2. Sync Environments
      const allEnvs = Array.isArray(environments) ? environments : [];
      for (const env of allEnvs) {
        // Skip global environment if passed, we only sync workspace-specific ones
        if (env.id === "global") continue;

        await tx.environment.upsert({
          where: { id: env.id },
          create: {
            id: env.id,
            name: env.name,
            variables: env.variables || [],
            secrets: env.secrets || [],
            workspaceId,
          },
          update: {
            name: env.name,
            variables: env.variables || [],
            secrets: env.secrets || [],
          },
        });
      }
    });

    // Notify others
    io.to(String(workspaceId)).emit("workspace-change", {
      type: "FULL_SYNC_COMPLETE",
      payload: { workspaceId },
    });

    res.json({ message: "Sync successful" });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Failed to sync" });
  }
};

async function syncFoldersAndRequests(
  tx: any,
  collectionId: string,
  parentFolderId: string | null,
  folders: any[],
  requests: any[],
) {
  // Sync folders
  for (const folder of folders) {
    await tx.folder.upsert({
      where: { id: folder.id },
      create: {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        auth: folder.auth,
        headers: folder.headers,
        variables: folder.variables,
        collectionId,
        parentFolderId,
      },
      update: {
        name: folder.name,
        description: folder.description,
        auth: folder.auth,
        headers: folder.headers,
        variables: folder.variables,
      },
    });

    // Recursively sync sub-folders and requests
    await syncFoldersAndRequests(
      tx,
      collectionId,
      folder.id,
      folder.folders || [],
      folder.requests || [],
    );
  }

  // Sync requests
  for (const req of requests) {
    await tx.request.upsert({
      where: { id: req.id },
      create: {
        id: req.id,
        name: req.name,
        method: req.method,
        url: req.url,
        description: req.description,
        headers: req.headers,
        params: req.params,
        body: req.body,
        auth: req.auth,
        preRequestScript: req.preRequestScript,
        postRequestScript: req.postRequestScript,
        collectionId: parentFolderId ? null : collectionId,
        folderId: parentFolderId,
      },
      update: {
        name: req.name,
        method: req.method,
        url: req.url,
        description: req.description,
        headers: req.headers,
        params: req.params,
        body: req.body,
        auth: req.auth,
        preRequestScript: req.preRequestScript,
        postRequestScript: req.postRequestScript,
        collectionId: parentFolderId ? null : collectionId,
        folderId: parentFolderId,
      },
    });
  }
}
