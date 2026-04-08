import { Router } from "express";
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from "../controllers/folder.controller.js";

const router = Router();

router.post("/", createFolder);
router.put("/:id", updateFolder);
router.delete("/:id", deleteFolder);

export default router;
