import { Router } from "express";
import {
  createRequest,
  updateRequest,
  getRequests,
} from "../controllers/request.controller.js";

const router = Router();

router.post("/", createRequest);
router.put("/:id", updateRequest);
router.get("/collection/:collectionId", getRequests);

export default router;
