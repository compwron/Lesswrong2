import React from 'react'
import {Provider} from 'react-redux'
import '@testing-library/jest-dom/extend-expect'
import {render} from '@testing-library/react'
import MarkDownPostEditorFormSettings from '../../components/MarkDownPostEditorFormSettings'
import {createStore} from 'redux'
import rootReducer from './js/redux/reducers/rootReducer'

it('renders welcome message', () => {
  const {getByText} = render(
      <MarkDownPostEditorFormSettings/>
  )
  expect(getByText('???')).toBeInTheDocument()
})
