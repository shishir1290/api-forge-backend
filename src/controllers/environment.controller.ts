import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const createEnvironment = async (req: AuthRequest, res: Response) => {
  try {
    const { name, workspaceId } = req.body;
    const userId = req.userId!;

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    const environment = await prisma.environment.create({
      data: {
        name,
        workspaceId,
        variables: [],
        secrets: [],
      },
    });

    io.to(workspaceId).emit("workspace-change", {
      type: "ENVIRONMENT_CREATED",
      payload: environment,
    });

    res.status(201).json(environment);
  } catch (error) {
    res.status(500).json({ error: "Failed to create environment" });
  }
};

export const updateEnvironment = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, variables, secrets } = req.body;
    const userId = req.userId!;

    const environment = await prisma.environment.findUnique({
      where: { id },
    });

    if (!environment) {
      return res.status(404).json({ error: "Environment not found" });
    }

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: environment.workspaceId! },
      },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    const updatedEnvironment = await prisma.environment.update({
      where: { id },
      data: { name, variables, secrets },
    });

    io.to(environment.workspaceId!).emit("workspace-change", {
      type: "ENVIRONMENT_UPDATED",
      payload: updatedEnvironment,
    });

    res.json(updatedEnvironment);
  } catch (error) {
    res.status(500).json({ error: "Failed to update environment" });
  }
};

export const deleteEnvironment = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.userId!;

    const environment = await prisma.environment.findUnique({
      where: { id },
    });

    if (!environment) {
      return res.status(404).json({ error: "Environment not found" });
    }

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: environment.workspaceId! },
      },
    });

    if (!membership || membership.role.toUpperCase() === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.environment.delete({ where: { id } });

    io.to(environment.workspaceId!).emit("workspace-change", {
      type: "ENVIRONMENT_DELETED",
      payload: { id },
    });

    res.json({ message: "Environment deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete environment" });
  }
};
