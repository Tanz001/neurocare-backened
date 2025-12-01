import chalk from "chalk";

// Helper function to create a box around text
const createBox = (title, content, color = chalk.white) => {
  const lines = content.split("\n");
  const maxWidth = Math.max(
    title.length + 4,
    ...lines.map((line) => line.length)
  );
  const horizontalLine = "═".repeat(maxWidth + 2);
  const topBorder = `╔${horizontalLine}╗`;
  const bottomBorder = `╚${horizontalLine}╝`;

  let box = `\n${color(topBorder)}\n`;
  box += `${color("║")} ${chalk.bold(title)}${" ".repeat(maxWidth - title.length - 1)}${color("║")}\n`;
  box += `${color("╠")}${"═".repeat(maxWidth + 2)}${color("╣")}\n`;

  lines.forEach((line) => {
    const padding = " ".repeat(maxWidth - line.length);
    box += `${color("║")} ${line}${padding} ${color("║")}\n`;
  });

  box += `${color(bottomBorder)}\n`;
  return box;
};

// Helper to mask sensitive data
const maskSensitiveData = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  const sensitiveFields = ["password", "token", "authorization"];
  const masked = { ...obj };

  sensitiveFields.forEach((field) => {
    if (masked[field]) {
      masked[field] = "***MASKED***";
    }
  });

  return masked;
};

// Logger middleware
export const loggerMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Log request
  const method = req.method;
  const url = req.originalUrl || req.url;
  const ip = req.ip || req.connection.remoteAddress;

  // Determine color based on method
  let methodColor = chalk.white;
  switch (method) {
    case "GET":
      methodColor = chalk.blue;
      break;
    case "POST":
      methodColor = chalk.green;
      break;
    case "PUT":
    case "PATCH":
      methodColor = chalk.yellow;
      break;
    case "DELETE":
      methodColor = chalk.red;
      break;
    default:
      methodColor = chalk.white;
  }

  // Request info
  const requestInfo = [
    `Method: ${methodColor(method)}`,
    `URL: ${chalk.cyan(url)}`,
    `IP: ${chalk.gray(ip)}`,
    `Timestamp: ${chalk.gray(timestamp)}`,
  ];

  // Request headers (excluding sensitive data)
  const headers = { ...req.headers };
  if (headers.authorization) {
    headers.authorization = "Bearer ***MASKED***";
  }

  // Request body (mask sensitive data)
  let requestBody = "";
  if (Object.keys(req.body || {}).length > 0) {
    const maskedBody = maskSensitiveData(req.body);
    requestBody = JSON.stringify(maskedBody, null, 2);
  }

  // Query parameters
  let queryParams = "";
  if (Object.keys(req.query || {}).length > 0) {
    queryParams = JSON.stringify(req.query, null, 2);
  }

  // Log request box
  console.log(
    createBox(
      `📥 INCOMING REQUEST`,
      [...requestInfo, queryParams ? `\nQuery Params:\n${queryParams}` : "", requestBody ? `\nRequest Body:\n${requestBody}` : ""]
        .filter(Boolean)
        .join("\n"),
      chalk.cyan
    )
  );

  // Capture response
  const originalSend = res.send;
  const originalJson = res.json;

  res.json = function (body) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Determine status color
    let statusColor = chalk.white;
    if (statusCode >= 200 && statusCode < 300) {
      statusColor = chalk.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      statusColor = chalk.yellow;
    } else if (statusCode >= 400) {
      statusColor = chalk.red;
    }

    // Response info
    const responseInfo = [
      `Status: ${statusColor(statusCode)} ${res.statusMessage || ""}`,
      `Duration: ${chalk.gray(duration + "ms")}`,
      `Timestamp: ${chalk.gray(new Date().toISOString())}`,
    ];

    // Response body (mask sensitive data)
    let responseBody = "";
    if (body) {
      const maskedBody = maskSensitiveData(body);
      responseBody = JSON.stringify(maskedBody, null, 2);
    }

    // Log response box
    const boxColor = statusCode >= 400 ? chalk.red : chalk.green;
    console.log(
      createBox(
        `📤 OUTGOING RESPONSE`,
        [...responseInfo, responseBody ? `\nResponse Body:\n${responseBody}` : ""]
          .filter(Boolean)
          .join("\n"),
        boxColor
      )
    );

    // Call original json method
    return originalJson.call(this, body);
  };

  res.send = function (body) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    let statusColor = chalk.white;
    if (statusCode >= 200 && statusCode < 300) {
      statusColor = chalk.green;
    } else if (statusCode >= 300 && statusCode < 400) {
      statusColor = chalk.yellow;
    } else if (statusCode >= 400) {
      statusColor = chalk.red;
    }

    const responseInfo = [
      `Status: ${statusColor(statusCode)} ${res.statusMessage || ""}`,
      `Duration: ${chalk.gray(duration + "ms")}`,
      `Timestamp: ${chalk.gray(new Date().toISOString())}`,
    ];

    let responseBody = "";
    if (body) {
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        const maskedBody = maskSensitiveData(parsed);
        responseBody = JSON.stringify(maskedBody, null, 2);
      } catch (e) {
        responseBody = body.toString();
      }
    }

    const boxColor = statusCode >= 400 ? chalk.red : chalk.green;
    console.log(
      createBox(
        `📤 OUTGOING RESPONSE`,
        [...responseInfo, responseBody ? `\nResponse Body:\n${responseBody}` : ""]
          .filter(Boolean)
          .join("\n"),
        boxColor
      )
    );

    return originalSend.call(this, body);
  };

  // Error handling
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      const duration = Date.now() - startTime;
      console.log(
        createBox(
          `❌ ERROR RESPONSE`,
          [
            `Status: ${chalk.red(res.statusCode)} ${res.statusMessage || ""}`,
            `Duration: ${chalk.gray(duration + "ms")}`,
            `URL: ${chalk.cyan(url)}`,
            `Method: ${methodColor(method)}`,
          ].join("\n"),
          chalk.red
        )
      );
    }
  });

  next();
};

// Error logger
export const errorLogger = (err, req, res, next) => {
  const errorInfo = [
    `Error: ${chalk.red(err.message || "Unknown error")}`,
    `Stack: ${chalk.gray(err.stack || "No stack trace")}`,
    `URL: ${chalk.cyan(req.originalUrl || req.url)}`,
    `Method: ${chalk.yellow(req.method)}`,
    `IP: ${chalk.gray(req.ip || req.connection.remoteAddress)}`,
  ];

  console.log(createBox(`🚨 ERROR OCCURRED`, errorInfo.join("\n"), chalk.red));

  next(err);
};

