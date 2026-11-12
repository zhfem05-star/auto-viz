from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.models import Project
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])

# 목업의 프로젝트 색 팔레트. 새 프로젝트마다 순서대로 배정한다.
PROJECT_COLORS = ["#c9703a", "#5b8ac9", "#5a9e6f", "#9b6bc9", "#c96b6b", "#c9b26b"]
DEFAULT_NAME = "새 프로젝트"


def get_project_or_404(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "프로젝트를 찾을 수 없습니다.")
    return project


def to_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        color=p.color,
        created_at=p.created_at,
        updated_at=p.updated_at,
        connection_status=p.connection.status if p.connection else None,
        llm_status=p.llm.status if p.llm else None,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(db: DbSession) -> list[ProjectOut]:
    projects = db.scalars(select(Project).order_by(Project.created_at)).all()
    return [to_out(p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: DbSession) -> ProjectOut:
    count = db.query(Project).count()
    project = Project(
        name=body.name or DEFAULT_NAME,
        color=body.color or PROJECT_COLORS[count % len(PROJECT_COLORS)],
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return to_out(project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: DbSession) -> ProjectOut:
    return to_out(get_project_or_404(db, project_id))


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate, db: DbSession) -> ProjectOut:
    project = get_project_or_404(db, project_id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return to_out(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, db: DbSession) -> Response:
    db.delete(get_project_or_404(db, project_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
