import { Router } from "express";
import {
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from "../controllers/environment.controller.js";

const router = Router();

router.post("/", createEnvironment);
router.put("/:id", updateEnvironment);
router.delete("/:id", deleteEnvironment);

export default router;
