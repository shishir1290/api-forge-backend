import { Router } from "express";
import {
  createRequest,
  updateRequest,
  getRequests,
  deleteRequest,
} from "../controllers/request.controller.js";

const router = Router();

router.post("/", createRequest);
router.put("/:id", updateRequest);
router.delete("/:id", deleteRequest);
router.get("/collection/:collectionId", getRequests);

export default router;
