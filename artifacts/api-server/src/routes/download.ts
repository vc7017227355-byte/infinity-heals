import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

const FINAL_UPDATED_APP_PATH = fileURLToPath(
  new URL(
    "../../../attached_assets/SignalBoard222_updated_1786507877795.jsx",
    import.meta.url,
  ),
);

router.get("/download/final-updated-app", async (_req, res, next) => {
  try {
    const file = await readFile(FINAL_UPDATED_APP_PATH);

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="FINAL_UPDATED_APP.jsx"',
    );
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.status(200).send(file);
  } catch (error) {
    next(error);
  }
});

export default router;