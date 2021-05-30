# pylint: disable=missing-docstring,unused-argument,multiple-statements
import enum
from typing import Optional
from typing import Iterable
from typing import Union

from beancount.core.data import Posting
from beancount.core.position import Position

class Booking(enum.Enum):
    CREATED: int = ...
    REDUCED: int = ...
    AUGMENTED: int = ...
    IGNORED: int = ...

class Inventory(dict):
    def __init__(
        self, positions: Optional[Iterable[Position]] = ...
    ) -> None: ...
    # def __iter__(self) -> Any: ...
    # def __lt__(self, other: Any) -> Any: ...
    # def to_string(self, dformat: Any = ..., parens: bool = ...): ...
    def is_empty(self) -> bool: ...
    # def __bool__(self) -> None: ...
    # def __copy__(self): ...
    # def is_small(self, tolerances: Any): ...
    # def is_mixed(self): ...
    # def is_reduced_by(self, ramount: Any): ...
    def __neg__(self) -> "Inventory": ...
    # def __abs__(self): ...
    # def __mul__(self, scalar: Any): ...
    # def currencies(self): ...
    # def cost_currencies(self): ...
    # def currency_pairs(self): ...
    # def get_positions(self): ...
    # def get_only_position(self): ...
    # def get_currency_units(self, currency: Any): ...
    # def segregate_units(self, currencies: Any): ...
    # def reduce(self, reducer: Any, *args: Any): ...
    # def average(self): ...
    # def add_amount(self, units: Any, cost: Optional[Any] = ...): ...
    def add_position(self, position: Union[Position, Posting]) -> None: ...
    # def add_inventory(self, other: Any): ...
    # def __add__(self, other: Any): ...
    # __iadd__: Any = ...
    # @staticmethod
    # def from_string(string: Any): ...

# from_string: Any

# def check_invariants(inv: Any) -> None: ...
