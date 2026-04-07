import { Router } from "express";
import {
  createCollection,
  getCollections,
  deleteCollection,
} from "../controllers/collection.controller.js";

const router = Router();

router.post("/", createCollection);
router.get("/workspace/:workspaceId", getCollections);
router.delete("/:id", deleteCollection);

export default router;
