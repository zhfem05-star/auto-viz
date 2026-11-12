import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installFakeApi } from '@/test/fakeApi'
import { renderApp } from '@/test/render'

const nav = () => screen.getByRole('navigation', { name: '프로젝트' })

describe('사이드바 프로젝트 목록', () => {
  it('프로젝트가 없으면 안내를 보여주고, 만들면 연결 설정으로 이동한다', async () => {
    const api = installFakeApi()
    const { user, router } = renderApp('/')

    await user.click(await screen.findByRole('button', { name: '첫 프로젝트 만들기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/new1/connection'))
    expect(api.bodiesOf('POST', '/api/projects')).toEqual([{}])
    expect(await screen.findByRole('heading', { name: '연결 설정' })).toBeInTheDocument()
    expect(within(nav()).getByText('새 프로젝트')).toBeInTheDocument()
  })

  it('헤더의 + 버튼으로도 프로젝트를 만든다', async () => {
    const api = installFakeApi({ projects: [{ id: 'a', name: '기존' }] })
    const { user, router } = renderApp('/')

    await within(nav()).findByText('기존')
    await user.click(screen.getByRole('button', { name: '새 프로젝트' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/new1/connection'))
    expect(api.projects).toHaveLength(2)
  })

  it('LLM/DB 상태를 표시한다', async () => {
    installFakeApi({
      projects: [{ id: 'a', name: '매출', llm_status: 'ok', connection_status: 'error' }],
    })
    renderApp('/')

    await within(nav()).findByText('매출')
    expect(screen.getByRole('img', { name: 'LLM: 연결됨' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'DB: 오류' })).toBeInTheDocument()
  })

  it('LLM이 준비되지 않은 프로젝트의 대화 섹션에 잠금 표시를 한다', async () => {
    installFakeApi({
      projects: [
        { id: 'a', name: '준비됨', llm_status: 'ok' },
        { id: 'b', name: '미설정', llm_status: null },
      ],
    })
    const { user } = renderApp('/')

    await user.click(await within(nav()).findByText('준비됨'))
    await user.click(within(nav()).getByText('미설정'))

    const lockIcons = screen.getAllByLabelText('LLM 설정 필요')
    expect(lockIcons).toHaveLength(1)
    expect(lockIcons[0].closest('a')).toHaveAttribute('href', '/projects/b/chat')
  })

  it('검색어로 프로젝트를 거른다', async () => {
    installFakeApi({ projects: [{ name: '매출 분석' }, { name: '회원 통계' }] })
    const { user } = renderApp('/')

    await within(nav()).findByText('매출 분석')
    await user.type(screen.getByRole('searchbox', { name: '프로젝트 검색' }), '회원')

    expect(within(nav()).queryByText('매출 분석')).not.toBeInTheDocument()
    expect(within(nav()).getByText('회원 통계')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: '프로젝트 검색' }))
    await user.type(screen.getByRole('searchbox', { name: '프로젝트 검색' }), '없는이름')
    expect(within(nav()).getByText('검색 결과가 없습니다')).toBeInTheDocument()
  })

  it('메뉴에서 이름을 바꾸면 PATCH를 보내고 입력칸은 포커스를 유지한다', async () => {
    const api = installFakeApi({ projects: [{ id: 'a', name: '옛 이름' }] })
    const { user } = renderApp('/')

    await user.click(await screen.findByRole('button', { name: '옛 이름 메뉴' }))
    await user.click(await screen.findByRole('menuitem', { name: '이름 변경' }))

    const input = await screen.findByRole('textbox', { name: '프로젝트 이름' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.clear(input)
    await user.type(input, '새 이름{Enter}')

    await waitFor(() =>
      expect(api.bodiesOf('PATCH', '/api/projects/a')).toEqual([{ name: '새 이름' }]),
    )
    expect(await within(nav()).findByText('새 이름')).toBeInTheDocument()
  })

  it('이름을 바꾸지 않고 Esc를 누르면 요청하지 않는다', async () => {
    const api = installFakeApi({ projects: [{ id: 'a', name: '그대로' }] })
    const { user } = renderApp('/')

    await user.click(await screen.findByRole('button', { name: '그대로 메뉴' }))
    await user.click(await screen.findByRole('menuitem', { name: '이름 변경' }))
    await user.type(await screen.findByRole('textbox', { name: '프로젝트 이름' }), '수정{Escape}')

    expect(api.bodiesOf('PATCH', '/api/projects/a')).toEqual([])
    expect(within(nav()).getByText('그대로')).toBeInTheDocument()
  })

  it('삭제는 확인 후 DELETE를 보내고, 보고 있던 프로젝트면 홈으로 이동한다', async () => {
    const api = installFakeApi({ projects: [{ id: 'a', name: '지울 것' }] })
    const { user, router } = renderApp('/projects/a/connection')

    await user.click(await screen.findByRole('button', { name: '지울 것 메뉴' }))
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/API 키 포함/)).toBeInTheDocument()
    expect(api.requests.some((r) => r.method === 'DELETE')).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual([
      '/api/projects/a',
    ])
    expect(await screen.findByText('아직 프로젝트가 없습니다')).toBeInTheDocument()
  })

  it('삭제를 취소하면 요청하지 않는다', async () => {
    const api = installFakeApi({ projects: [{ id: 'a', name: '남길 것' }] })
    const { user } = renderApp('/')

    await user.click(await screen.findByRole('button', { name: '남길 것 메뉴' }))
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }))

    expect(api.requests.some((r) => r.method === 'DELETE')).toBe(false)
    expect(within(nav()).getByText('남길 것')).toBeInTheDocument()
  })
})
