"""Redis cache with TTL, key hashing, and graceful degradation.

Provides a simple caching interface that works with or without Redis.
Falls back to in-memory cache when Redis is unavailable.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, UTC
from typing import Any

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis-backed cache with graceful degradation to in-memory storage.

    Usage:
        cache = RedisCache(redis_url="redis://localhost:6379")
        await cache.set("user:123", user_data, ttl=3600)
        user = await cache.get("user:123")
    """

    def __init__(self, redis_url: str | None = None) -> None:
        """Initialize cache with optional Redis URL.

        Args:
            redis_url: Redis connection URL. If None, uses in-memory fallback.
        """
        self._redis_url = redis_url
        self._redis: Any = None
        self._memory_cache: dict[str, tuple[Any, float | None]] = {}
        self._stats = {"hits": 0, "misses": 0, "sets": 0, "deletes": 0}
        self._connected = False

    async def connect(self) -> bool:
        """Establish Redis connection if URL is configured."""
        if not self._redis_url:
            logger.info("No Redis URL configured, using in-memory cache")
            return False

        try:
            import redis.asyncio as redis

            self._redis = redis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()
            self._connected = True
            logger.info("Connected to Redis cache")
            return True
        except ImportError:
            logger.warning("redis package not installed, using in-memory cache")
            return False
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}, using in-memory cache")
            return False

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            self._redis = None
            self._connected = False

    def _hash_key(self, key: str) -> str:
        """Generate a consistent hash for cache keys."""
        return hashlib.sha256(key.encode()).hexdigest()[:32]

    def _serialize(self, value: Any) -> str:
        """Serialize value for storage."""
        return json.dumps(value, default=str)

    def _deserialize(self, value: str) -> Any:
        """Deserialize value from storage."""
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return value

    def _is_expired(self, expiry: float | None) -> bool:
        """Check if a cached value has expired."""
        if expiry is None:
            return False
        return datetime.now(UTC).timestamp() > expiry

    async def get(self, key: str) -> Any | None:
        """Retrieve a value from cache.

        Args:
            key: Cache key to retrieve.

        Returns:
            Cached value or None if not found/expired.
        """
        hashed_key = self._hash_key(key)

        if self._connected and self._redis:
            try:
                value = await self._redis.get(hashed_key)
                if value is not None:
                    self._stats["hits"] += 1
                    return self._deserialize(value)
                self._stats["misses"] += 1
                return None
            except Exception as e:
                logger.warning(f"Redis get failed: {e}, falling back to memory")

        # In-memory fallback
        if hashed_key in self._memory_cache:
            value, expiry = self._memory_cache[hashed_key]
            if not self._is_expired(expiry):
                self._stats["hits"] += 1
                return value
            del self._memory_cache[hashed_key]

        self._stats["misses"] += 1
        return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int = 3600,
    ) -> bool:
        """Store a value in cache.

        Args:
            key: Cache key.
            value: Value to cache (must be JSON-serializable).
            ttl: Time-to-live in seconds (default: 1 hour).

        Returns:
            True if successfully cached.
        """
        hashed_key = self._hash_key(key)
        serialized = self._serialize(value)

        if self._connected and self._redis:
            try:
                await self._redis.set(hashed_key, serialized, ex=ttl)
                self._stats["sets"] += 1
                return True
            except Exception as e:
                logger.warning(f"Redis set failed: {e}, falling back to memory")

        # In-memory fallback
        expiry = datetime.now(UTC).timestamp() + ttl if ttl > 0 else None
        self._memory_cache[hashed_key] = (value, expiry)
        self._stats["sets"] += 1
        return True

    async def delete(self, key: str) -> bool:
        """Remove a value from cache.

        Args:
            key: Cache key to delete.

        Returns:
            True if key was deleted.
        """
        hashed_key = self._hash_key(key)

        if self._connected and self._redis:
            try:
                result = await self._redis.delete(hashed_key)
                self._stats["deletes"] += 1
                return result > 0
            except Exception as e:
                logger.warning(f"Redis delete failed: {e}, falling back to memory")

        # In-memory fallback
        if hashed_key in self._memory_cache:
            del self._memory_cache[hashed_key]
            self._stats["deletes"] += 1
            return True
        return False

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a pattern.

        Args:
            pattern: Glob-style pattern (e.g., "user:*").

        Returns:
            Number of keys invalidated.
        """
        count = 0

        if self._connected and self._redis:
            try:
                cursor = 0
                while True:
                    cursor, keys = await self._redis.scan(
                        cursor, match=self._hash_key(pattern.replace("*", "")), count=100
                    )
                    if keys:
                        count += await self._redis.delete(*keys)
                    if cursor == 0:
                        break
                return count
            except Exception as e:
                logger.warning(f"Redis pattern invalidation failed: {e}")

        # In-memory fallback - simple prefix matching
        prefix = pattern.replace("*", "")
        hashed_prefix = self._hash_key(prefix)[:8]
        keys_to_delete = [
            k for k in self._memory_cache if k.startswith(hashed_prefix)
        ]
        for k in keys_to_delete:
            del self._memory_cache[k]
            count += 1

        return count

    async def clear(self) -> None:
        """Clear all cached values."""
        if self._connected and self._redis:
            try:
                await self._redis.flushdb()
            except Exception as e:
                logger.warning(f"Redis flush failed: {e}")

        self._memory_cache.clear()

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics.

        Returns:
            Dictionary with hits, misses, sets, deletes, and hit rate.
        """
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = self._stats["hits"] / total if total > 0 else 0.0

        return {
            **self._stats,
            "hit_rate": round(hit_rate, 3),
            "memory_size": len(self._memory_cache),
            "connected": self._connected,
        }


# Global cache instance (initialized lazily)
_cache: RedisCache | None = None


def get_cache() -> RedisCache:
    """Get the global cache instance."""
    global _cache
    if _cache is None:
        from packages.common.core.config import settings

        _cache = RedisCache(redis_url=getattr(settings, "REDIS_URL", None))
    return _cache
