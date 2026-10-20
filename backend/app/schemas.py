from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from .growth import STAGE_PROGRESS


class InputModel(BaseModel):
    model_config = {'str_strip_whitespace': True, 'allow_inf_nan': False}

    @field_validator('*', mode='before')
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError('字段不能为 null，请省略不需要修改的字段')
        return value


PlotKind = Literal[
    "leafy",
    "tomato",
    "loofah",
    "scallion",
    "root",
    "cabbage",
    "herb",
    "pepper",
    "legume",
    "corn",
    "strawberry",
    "mushroom",
    "flower",
    "tuber",
]
Health = Literal["良好", "留意"]
IssueKind = Literal["pest", "disease", "weed"]
IssueStatus = Literal["open", "monitoring", "resolved"]
SceneWeather = Literal["sunny", "rain", "mist"]
ThreatKind = Literal["pest", "disease"]


class PlotCreate(InputModel):
    id: str = Field(pattern=r"^[0-9]{1,6}$")
    name: str = Field(min_length=1, max_length=40)
    crop: str = Field(min_length=1, max_length=40)
    variety: str = Field(default="", max_length=60)
    kind: PlotKind = "leafy"
    stage: str = Field(default="播种期", max_length=30)
    planted_on: date = Field(default_factory=date.today)
    progress: int = Field(default=0, ge=0, le=100)
    health: Health = "良好"
    moisture: int = Field(default=60, ge=0, le=100)
    plant_count: int = Field(default=0, ge=0, le=100000)
    area_m2: float = Field(default=8.4, gt=0, le=667)
    width_m: float = Field(default=7, gt=0, le=30)
    depth_m: float = Field(default=1.2, gt=0, le=5)
    soil_type: str = Field(default="壤土", max_length=30)
    note: str = Field(default="", max_length=500)
    image_url: str = Field(default="", max_length=500)
    crop_image_url: str = Field(default="", max_length=500)
    seed_supply_id: int | None = Field(default=None, ge=0)

    @field_validator("id")
    @classmethod
    def normalize_id(cls, value: str) -> str:
        return value.zfill(3)

    @field_validator('stage')
    @classmethod
    def valid_stage(cls, value: str) -> str:
        if value not in STAGE_PROGRESS:
            raise ValueError('请选择有效的生长阶段')
        return value


class PlotUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    crop: str | None = Field(default=None, min_length=1, max_length=40)
    variety: str | None = Field(default=None, max_length=60)
    kind: PlotKind | None = None
    stage: str | None = Field(default=None, max_length=30)
    planted_on: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    health: Health | None = None
    moisture: int | None = Field(default=None, ge=0, le=100)
    plant_count: int | None = Field(default=None, ge=0, le=100000)
    area_m2: float | None = Field(default=None, gt=0, le=667)
    width_m: float | None = Field(default=None, gt=0, le=30)
    depth_m: float | None = Field(default=None, gt=0, le=5)
    position_x: float | None = Field(default=None, ge=-13.5, le=13.5)
    position_z: float | None = Field(default=None, ge=-9.5, le=9.5)
    soil_type: str | None = Field(default=None, max_length=30)
    note: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)
    crop_image_url: str | None = Field(default=None, max_length=500)
    # 0 means clear the optional association; omitting the field keeps it.
    seed_supply_id: int | None = Field(default=None, ge=0)

    @field_validator('stage')
    @classmethod
    def valid_stage(cls, value: str) -> str:
        return PlotCreate.valid_stage(value)


class PlotSegmentInput(InputModel):
    lengthM: float = Field(gt=0, le=30)
    crop: str = Field(min_length=1, max_length=40)
    kind: PlotKind = "leafy"
    stage: str = Field(default="播种期", max_length=30)

    @field_validator('stage')
    @classmethod
    def valid_stage(cls, value: str) -> str:
        return PlotCreate.valid_stage(value)


class PlotSegmentsUpdate(InputModel):
    segments: list[PlotSegmentInput] = Field(max_length=24)


class RecordCreate(InputModel):
    plotId: str = Field(pattern=r"^[0-9]{1,6}$")
    action: str = Field(min_length=1, max_length=30)
    note: str = Field(default="", max_length=500)
    amount: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    occurredAt: datetime | None = None
    supplyId: int | None = Field(default=None, gt=0)

    @field_validator("plotId")
    @classmethod
    def normalize_plot_id(cls, value: str) -> str:
        return value.zfill(3)


class QrBindingUpdate(InputModel):
    plotId: str = Field(pattern=r"^[0-9]{1,6}$")

    @field_validator("plotId")
    @classmethod
    def normalize_plot_id(cls, value: str) -> str:
        return value.zfill(3)


class IssueCreate(InputModel):
    plotId: str = Field(pattern=r"^[0-9]{1,6}$")
    kind: IssueKind
    name: str = Field(min_length=1, max_length=60)
    severity: str = Field(default="轻微", max_length=20)
    symptoms: str = Field(default="", max_length=500)
    treatment: str = Field(default="", max_length=500)

    @field_validator("plotId")
    @classmethod
    def normalize_plot_id(cls, value: str) -> str:
        return value.zfill(3)


class IssueUpdate(InputModel):
    severity: str | None = Field(default=None, max_length=20)
    symptoms: str | None = Field(default=None, max_length=500)
    treatment: str | None = Field(default=None, max_length=500)
    status: IssueStatus | None = None


class SupplyCreate(InputModel):
    name: str = Field(min_length=1, max_length=80)
    category: Literal["fertilizer", "pesticide", "tool", "seed"]
    stock: float = Field(default=0, ge=0)
    unit: str = Field(default="", max_length=20)
    safe_interval_days: int = Field(default=0, ge=0, le=365)
    note: str = Field(default="", max_length=500)
    image_url: str = Field(default="", max_length=500)


class SupplyUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    category: Literal["fertilizer", "pesticide", "tool", "seed"] | None = None
    stock: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    safe_interval_days: int | None = Field(default=None, ge=0, le=365)
    note: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)


class ThreatCreate(InputModel):
    kind: ThreatKind
    name: str = Field(min_length=1, max_length=60)
    aliases: list[str] = Field(default_factory=list)
    crops: list[str] = Field(default_factory=list)
    symptoms: str = Field(default="", max_length=500)
    suggestion: str = Field(default="", max_length=500)
    season: str = Field(default="", max_length=100)
    severity: Literal["轻微", "中等", "严重"] = "中等"
    image_url: str = Field(default="", max_length=500)
    source_url: str = Field(default="", max_length=500)
    image_credit: str = Field(default="", max_length=200)
    license: str = Field(default="", max_length=100)


class ThreatUpdate(InputModel):
    kind: ThreatKind | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    aliases: list[str] | None = None
    crops: list[str] | None = None
    symptoms: str | None = Field(default=None, max_length=500)
    suggestion: str | None = Field(default=None, max_length=500)
    season: str | None = Field(default=None, max_length=100)
    severity: Literal["轻微", "中等", "严重"] | None = None
    image_url: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=500)
    image_credit: str | None = Field(default=None, max_length=200)
    license: str | None = Field(default=None, max_length=100)


UploadCategory = Literal["plots", "crops", "supplies", "growth", "threats"]


class MediaUploadTokenRequest(InputModel):
    category: UploadCategory
    owner_id: str = Field(min_length=1, max_length=80)
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(min_length=1, max_length=100)
    size: int = Field(gt=0, le=20 * 1024 * 1024)


class GrowthPhotoCreate(InputModel):
    image_url: str = Field(min_length=1, max_length=500)
    note: str = Field(default="", max_length=500)
    taken_at: datetime | None = None


class SupplyImageCreate(InputModel):
    image_url: str = Field(min_length=1, max_length=500)
    note: str = Field(default="", max_length=500)


class AdminLogin(InputModel):
    pin: str = Field(pattern=r"^\d{4}$")
