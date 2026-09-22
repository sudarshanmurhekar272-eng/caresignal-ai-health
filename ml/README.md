# ML module

`predict.js` currently provides a transparent heuristic fallback so the rest of the application can be exercised without pretending that a clinical model exists. It deliberately returns no probability or confidence score.

Replace it with a validated model only after documenting the dataset, preprocessing, training procedure, validation split, metrics, limitations, and intended use. Any future model should be reviewed for data leakage, subgroup performance, calibration, and medical safety.