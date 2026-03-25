import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import dealsRouter     from "./deals";
import ecosystemRouter from "./ecosystem";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dealsRouter);
router.use(ecosystemRouter);

export default router;
