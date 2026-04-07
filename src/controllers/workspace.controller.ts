import { Response } from "express";
import { prisma } from "../lib/prisma.js";
import { io } from "../index.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const createWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const userId = req.userId!;

    const workspace = await prisma.workspace.create({
      data: {
        name,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });

    res.status(201).json({ workspace });
  } catch (error) {
    res.status(500).json({ error: "Failed to create workspace" });
  }
};

export const getWorkspaces = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });
    res.json({ workspaces });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch workspaces" });
  }
};

export const getWorkspaceCollections = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Check membership
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: id as string },
      },
    });

    if (!member) {
      return res.status(403).json({ error: "Access denied" });
    }

    const collections = await prisma.collection.findMany({
      where: { workspaceId: id as string },
      orderBy: { createdAt: "asc" },
      include: {
        folders: {
          orderBy: { createdAt: "asc" },
          include: {
            requests: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
        requests: {
          where: { folderId: null },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const buildFolderTree = (
      allFolders: any[],
      parentId: string | null = null,
    ): any[] => {
      return allFolders
        .filter((f) => f.parentFolderId === parentId)
        .map((f) => ({
          ...f,
          subFolders: buildFolderTree(allFolders, f.id),
        }));
    };

    const mappedCollections = collections.map((col) => ({
      ...col,
      folders: buildFolderTree(col.folders, null),
    }));

    const environments = await prisma.environment.findMany({
      where: { workspaceId: id as string },
    });

    res.json({ collections: mappedCollections, environments });
  } catch (error) {
    console.error("Fetch collections error:", error);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
};
export const inviteToWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { id: workspaceId } = req.params;
    const { email, role } = req.body;
    const inviterId = req.userId!;

    // Check if inviter is OWNER or ADMIN
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: inviterId,
          workspaceId: workspaceId as string,
        },
      },
    });

    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
      return res
        .status(403)
        .json({ error: "Only owners and admins can invite members" });
    }

    // Check if user already in workspace
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: workspaceId as string,
        user: { email },
      },
    });

    if (existingMember) {
      return res
        .status(400)
        .json({ error: "User is already a member of this workspace" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create or update invitation
    const invitation = await prisma.invitation.upsert({
      where: {
        email_workspaceId: { email, workspaceId: workspaceId as string },
      },
      create: {
        email,
        role: (role || "MEMBER").toUpperCase(),
        workspaceId: workspaceId as string,
        inviterId,
        status: "PENDING",
      },
      update: {
        role: (role || "MEMBER").toUpperCase(),
        status: "PENDING",
        inviterId,
      },
      include: {
        workspace: { select: { name: true } },
        inviter: { select: { name: true, email: true } },
      },
    });

    // Notify user if they are online (future improvement: search by email to find socket)
    // For now, we'll rely on pulling when they refresh or open the app

    res.json({ invitation });
  } catch (error) {
    console.error("Invite error:", error);
    res.status(500).json({ error: "Failed to send invitation" });
  }
};

export const updateMemberRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id: workspaceId, userId: targetUserId } = req.params;
    const { role } = req.body;
    const requesterId = req.userId!;

    // Check if requester is OWNER
    const requesterMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: requesterId,
          workspaceId: workspaceId as string,
        },
      },
    });

    const requesterRole = requesterMember?.role.toUpperCase();

    if (
      !requesterMember ||
      (requesterRole !== "OWNER" && requesterRole !== "ADMIN")
    ) {
      return res
        .status(403)
        .json({ error: "Only owners and admins can change member roles" });
    }

    // Check if targeting yourself
    if (requesterId === targetUserId) {
      return res.status(400).json({ error: "You cannot change your own role" });
    }

    // Update role
    const updatedMember = await prisma.workspaceMember.update({
      where: {
        userId_workspaceId: {
          userId: targetUserId as string,
          workspaceId: workspaceId as string,
        },
      },
      data: { role: role.toUpperCase() },
    });

    res.json({ member: updatedMember });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({ error: "Failed to update member role" });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id: workspaceId, userId: targetUserId } = req.params;
    const requesterId = req.userId!;

    const requesterMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: requesterId,
          workspaceId: workspaceId as string,
        },
      },
    });

    const requesterRole = requesterMember?.role.toUpperCase();
    console.log(
      `RemoveMember: requester=${requesterId}, ws=${workspaceId}, foundMemberRole=${requesterRole}`,
    );

    if (
      !requesterMember ||
      (requesterRole !== "OWNER" && requesterRole !== "ADMIN")
    ) {
      return res
        .status(403)
        .json({ error: "Only owners and admins can remove members" });
    }

    if (requesterId === targetUserId) {
      return res.status(400).json({
        error: "Owners cannot remove themselves (delete the workspace instead)",
      });
    }

    console.log(
      `RemoveMember Attempt: targetUser=${targetUserId}, ws=${workspaceId}`,
    );

    const deleteResult = await prisma.workspaceMember.deleteMany({
      where: {
        userId: targetUserId as string,
        workspaceId: workspaceId as string,
      },
    });

    console.log(`RemoveMember Result: deletedCount=${deleteResult.count}`);

    if (deleteResult.count === 0) {
      // Check if member exists at all
      const check = await prisma.workspaceMember.findFirst({
        where: {
          userId: targetUserId as string,
          workspaceId: workspaceId as string,
        },
      });
      console.log(`RemoveMember DEBUG: doesMemberExist=${!!check}`);
    }

    res.json({ message: "Member removed" });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({ error: "Failed to remove member" });
  }
};
