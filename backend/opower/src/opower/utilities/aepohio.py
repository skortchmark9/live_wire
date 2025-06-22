"""AEP Ohio."""

from .aepbase import AEPBase
from .base import UtilityBase


class AEPOHio(AEPBase, UtilityBase):
    """AEP Ohio."""

    @staticmethod
    def name() -> str:
        """Distinct recognizable name of the utility."""
        return "AEP Ohio"

    @staticmethod
    def hostname() -> str:
        """Return the hostname for login."""
        return "aepohio.com"
