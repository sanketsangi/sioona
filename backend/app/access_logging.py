"""Keep URL search text out of Uvicorn access records."""
import logging


class RedactQueryString(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Uvicorn emits (client, method, full_path, version, status).
        if isinstance(record.args, tuple) and len(record.args) == 5:
            client, method, path, version, status = record.args
            if isinstance(path, str):
                record.args = (client, method, path.split('?', 1)[0], version, status)
        return True


def configure_access_logging() -> None:
    logger = logging.getLogger('uvicorn.access')
    if not any(isinstance(item, RedactQueryString) for item in logger.filters):
        logger.addFilter(RedactQueryString())
