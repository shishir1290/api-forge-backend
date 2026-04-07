import { Router } from "express";
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceCollections,
  inviteToWorkspace,
  updateMemberRole,
  removeMember,
} from "../controllers/workspace.controller.js";
import { syncCollections } from "../controllers/sync.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post("/", createWorkspace);
router.get("/", getWorkspaces);
router.get("/:id/collections", getWorkspaceCollections);
router.post("/:id/invite", inviteToWorkspace);
router.patch("/:id/members/:userId/role", updateMemberRole);
router.delete("/:id/members/:userId", removeMember);
router.post("/:workspaceId/sync", syncCollections);

export default router;
