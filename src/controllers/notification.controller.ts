import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { io } from "../index.js";

export const getInvitations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.email) {
      return res.status(404).json({ error: "User not found" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Legacy support for invitations tab (filtered to pending)
    const invitations = await prisma.invitation.findMany({
      where: {
        email: user.email,
        status: "PENDING",
      },
      include: {
        workspace: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ notifications, invitations });
  } catch (error) {
    console.error("Fetch invitations error:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
};

export const respondToInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { action } = req.body; // "ACCEPT" or "REJECT"
    const userId = req.userId!;

    const invitation = await prisma.invitation.findUnique({
      where: { id },
      include: { workspace: true },
    });

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== invitation.email) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (action === "ACCEPT") {
      await prisma.$transaction(async (tx) => {
        // 1. Create workspace member
        await tx.workspaceMember.create({
          data: {
            userId,
            workspaceId: invitation.workspaceId,
            role: invitation.role.toUpperCase(),
          },
        });

        // 2. Update invitation status
        await tx.invitation.update({
          where: { id },
          data: { status: "ACCEPTED" },
        });

        // 3. Update notification status
        await tx.notification.updateMany({
          where: {
            userId,
            type: "INVITATION",
            data: { path: ["invitationId"], equals: id },
          },
          data: { status: "ACCEPTED", read: true },
        });
      });

      // 3. Notify the workspace room about the new member
      io.to(invitation.workspaceId).emit("workspace-change", {
        type: "MEMBER_JOINED",
        payload: { workspaceId: invitation.workspaceId, userId },
      });

      return res.json({
        message: "Invitation accepted",
        workspaceId: invitation.workspaceId,
      });
    } else if (action === "REJECT") {
      await prisma.$transaction([
        prisma.invitation.update({
          where: { id },
          data: { status: "REJECTED" },
        }),
        prisma.notification.updateMany({
          where: {
            userId,
            type: "INVITATION",
            data: { path: ["invitationId"], equals: id },
          },
          data: { status: "REJECTED", read: true },
        }),
      ]);
      return res.json({ message: "Invitation rejected" });
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error) {
    console.error("Respond invitation error:", error);
    res.status(500).json({ error: "Failed to respond to invitation" });
  }
};
