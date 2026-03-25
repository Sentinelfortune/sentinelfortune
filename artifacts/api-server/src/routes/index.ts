import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import dealsRouter     from "./deals";
import ecosystemRouter from "./ecosystem";
import buildersRouter  from "./builders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dealsRouter);
router.use(ecosystemRouter);
router.use(buildersRouter);

export default router;
