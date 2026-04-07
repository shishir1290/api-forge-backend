import { Router } from "express";
import {
  getInvitations,
  respondToInvitation,
} from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/invitations", getInvitations);
router.post("/invitations/:id/respond", respondToInvitation);

export default router;
