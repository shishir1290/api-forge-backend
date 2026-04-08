import { Router } from "express";
import {
  createCollection,
  getCollections,
  deleteCollection,
  importCollections,
} from "../controllers/collection.controller.js";

const router = Router();

router.post("/", createCollection);
router.post("/import", importCollections);
router.get("/workspace/:workspaceId", getCollections);
router.delete("/:id", deleteCollection);

export default router;
